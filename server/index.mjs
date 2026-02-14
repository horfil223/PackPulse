import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createGetgemsClient } from './getgems.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json({ limit: '1mb' }))

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../dist')))

let getgems = null

function ensureGetgems() {
  if (!getgems) {
    if (!process.env.GETGEMS_API_KEY) {
      throw new Error('GETGEMS_API_KEY is not set')
    }
    getgems = createGetgemsClient(process.env.GETGEMS_API_KEY)
  }
  return getgems
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../dist')))

// Serve manifest directly at root for easier access
// Updated: Force HTTPS for cloud hosting to prevent 404
app.get('/tonconnect-manifest.json', (req, res) => {
  // If we have a static file, we should serve it. 
  // But since we want dynamic origin, we keep this handler.
  // HOWEVER, the 404 might be because the static middleware above is not finding it 
  // OR this handler is not working correctly with the wallet.
  
  // Let's try to serve the static file if it exists, otherwise generate dynamic
  // Actually, let's just use the dynamic one but make it super simple and robust.
  
  const host = req.headers.host || 'localhost:3002'
  
  // Force HTTPS for production domains if protocol detection fails
  let protocol = 'https'
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    protocol = 'http'
  } else {
    const forwardedProto = req.headers['x-forwarded-proto']
    if (forwardedProto && typeof forwardedProto === 'string') {
       protocol = forwardedProto
    }
    if (host.includes('koyeb.app') || host.includes('onrender.com')) {
      protocol = 'https'
    }
  }

  const origin = `${protocol}://${host}`

  const manifest = {
    url: origin,
    name: 'PackPulse',
    iconUrl: `${origin}/tonconnect-icon.svg`,
    termsOfUseUrl: origin,
    privacyPolicyUrl: origin,
  }
  
  res.json(manifest)
})

app.get('/api/diag/getgems', async (req, res) => {
  try {
    const gg = ensureGetgems()
    const status = await gg.testConnection()
    res.json({ ok: true, status })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

function pickEventTimeMs(ev) {
  // Getgems event structure: date is in seconds
  if (typeof ev.date === 'number') return ev.date * 1000
  // Fallback if date is missing or string (rare)
  return null
}

app.post('/api/market/scan', async (req, res) => {
  try {
    const gg = ensureGetgems()
    const limitPages = req.body.limitPages || 5
    const result = await gg.scanMarketHistory(limitPages)
    res.json({ ok: true, result })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/market/stickerpacks', async (req, res) => {
  try {
    const gg = ensureGetgems()
    const limit = Number(req.query.limit || 50)
    const mode = req.query.mode || 'active' // 'active' | 'full'
    
    // Get unique collections from our memory cache
    const collections = gg.getUniqueCollections()
    
    // If mode is 'active', we want only those that have sales in recent history
    // But since we store everything in memory now, we can just return all or filter
    
    const result = []
    
    for (const [address, data] of collections) {
      // For 'active' mode, you might want to filter by lastSoldAt age
      // For now return all we found
      result.push({
        collectionAddress: address,
        ...data
      })
    }

    // Sort by sales count desc by default for API
    result.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))

    res.json({
      ok: true,
      collections: result.slice(0, limit),
      source: {
        uniqueCollections: collections.size,
        pagesScanned: gg.stats.pagesScanned,
        eventsScanned: gg.stats.eventsScanned
      }
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

app.get('/api/portfolio/:address', async (req, res) => {
  try {
    const gg = ensureGetgems()
    const address = req.params.address
    
    // 1. Get user's NFT items
    // Since Getgems doesn't have a simple "get all stickers for user" endpoint in public API easily,
    // we will use a workaround: get all NFTs and filter by known sticker collections?
    // OR: Just get all NFTs and assume they are what they are.
    // Better: Getgems has `v1/users/{addr}/assets`.
    
    // But wait, our simple client uses GraphQL or internal API emulation.
    // Let's implement a simple "getUserStickers" in our client
    
    const items = await gg.getUserStickers(address)
    
    // 2. Group by collection
    const byCollection = new Map()
    let totalFloorTon = 0
    let totalAvgSoldTon = 0
    
    for (const item of items) {
      const colAddr = item.collection?.address ?? 'unknown'
      if (!byCollection.has(colAddr)) {
        // Try to get stats for this collection from our market cache if available
        const marketStats = gg.getCollectionStats(colAddr)
        
        byCollection.set(colAddr, {
          collectionAddress: colAddr,
          name: item.collection?.name ?? 'Unknown Collection',
          items: [],
          stats: marketStats
        })
      }
      const group = byCollection.get(colAddr)
      group.items.push(item)
    }
    
    // 3. Calculate portfolio value
    const collectionsResult = []
    for (const [addr, group] of byCollection) {
      const count = group.items.length
      const floor = group.stats?.floorTon || 0
      const avg = group.stats?.avgSoldTon || 0
      const median = group.stats?.medianSoldTon || 0
      
      const valueFloor = count * floor
      const valueAvg = count * avg // or median
      const valueMedian = count * median

      totalFloorTon += valueFloor
      totalAvgSoldTon += valueMedian || valueAvg // Prefer median for portfolio value

      collectionsResult.push({
        collectionAddress: addr,
        sampleName: group.name,
        sampleImage: group.items[0]?.image, // simple image pick
        count,
        floorTon: floor,
        avgSoldTon: avg,
        medianSoldTon: median,
        valueFloorTon: valueFloor,
        valueAvgSoldTon: valueAvg,
        valueMedianSoldTon: valueMedian,
        salesCount: group.stats?.salesCount,
        lastSoldAt: group.stats?.lastSoldAt
      })
    }
    
    // Sort by value desc
    collectionsResult.sort((a, b) => b.valueFloorTon - a.valueFloorTon)

    res.json({
      ok: true,
      portfolio: {
        collections: collectionsResult,
        counts: {
          stickersTotal: items.length,
          collectionsTotal: collectionsResult.length
        },
        totals: {
          totalFloorTon,
          totalAvgSoldTon
        }
      }
    })

  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

const port = Number(process.env.PORT || 3002)
app.listen(port, () => {
  process.stdout.write(`API listening on http://localhost:${port}\n`)
})

// Catch-all handler to serve the React app for any unknown routes
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})
