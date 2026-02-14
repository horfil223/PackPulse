import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createGetgemsClient } from './getgems.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.join(__dirname, '../dist')

const app = express()
app.use(express.json({ limit: '1mb' }))

app.use(
  '/assets',
  express.static(path.join(distDir, 'assets'), {
    immutable: true,
    maxAge: '365d',
    index: false,
  }),
)

app.use(
  express.static(distDir, {
    index: false,
    maxAge: '1h',
  }),
)

let getgems = null

function ensureGetgems() {
  if (!getgems) {
    if (!process.env.GETGEMS_API_KEY) {
      throw new Error('GETGEMS_API_KEY is missing')
    }
    getgems = createGetgemsClient({ apiKey: process.env.GETGEMS_API_KEY })
  }
  return getgems
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.get('/api/diag/env', (req, res) => {
  const value = process.env.GETGEMS_API_KEY
  res.json({
    ok: true,
    hasGetgemsApiKey: Boolean(value),
    getgemsApiKeyLength: typeof value === 'string' ? value.length : 0,
  })
})

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

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
  
  res.setHeader('Cache-Control', 'no-store')
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
    let collections = gg.getUniqueCollections()
    if (collections.size === 0 && mode === 'active') {
      await gg.scanMarketHistory(3)
      collections = gg.getUniqueCollections()
    }
    
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

    const pageItems = result.slice(0, limit)
    const needImage = pageItems.filter((c) => !c.sampleImage).slice(0, 20)
    for (const c of needImage) {
      try {
        const page = await gg.getCollectionNfts(c.collectionAddress, { limit: 1 })
        const items = Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : []
        const first = items[0]
        const img = first?.image ?? first?.preview ?? first?.icon ?? null
        if (img) c.sampleImage = img
      } catch {}
    }

    const needFloor = pageItems.filter((c) => c.floorTon === null || c.floorTon === undefined).slice(0, 20)
    for (const c of needFloor) {
      try {
        const info = await gg.getCollectionBasicInfo(c.collectionAddress)
        if (typeof info?.floor === 'number') c.floorTon = info.floor
        if (!c.displayName && typeof info?.name === 'string') c.displayName = info.name
        if (!c.sampleImage && typeof info?.image_url === 'string') c.sampleImage = info.image_url
      } catch {}
    }

    res.json({
      ok: true,
      collections: pageItems,
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
    
    let marketCollections = gg.getUniqueCollections()
    if (marketCollections.size === 0) {
      await gg.scanMarketHistory(3)
      marketCollections = gg.getUniqueCollections()
    }

    const allItems = await gg.getUserStickers(address)
    const targetCollections = new Set(allItems.map((x) => x?.collectionAddress ?? null).filter(Boolean))
    const stickerCollections = await gg.findStickerCollections(targetCollections)
    const items = allItems.filter((item) => stickerCollections.has(item?.collectionAddress ?? ''))
    
    // 2. Group by collection
    const byCollection = new Map()
    
    const collectionInfoCache = new Map()

    for (const item of items) {
      const colAddr = item?.collectionAddress ?? 'unknown'
      if (!byCollection.has(colAddr)) {
        const marketStats = gg.getCollectionStats(colAddr)
        let info = null
        if (colAddr !== 'unknown') {
          info = collectionInfoCache.get(colAddr) ?? null
          if (!info) {
            try {
              info = await gg.getCollectionBasicInfo(colAddr)
              collectionInfoCache.set(colAddr, info)
            } catch {}
          }
        }

        byCollection.set(colAddr, {
          collectionAddress: colAddr,
          name: info?.name ?? 'Unknown Collection',
          image: info?.image_url ?? null,
          info,
          items: [],
          stats: marketStats
        })
      }
      const group = byCollection.get(colAddr)
      group.items.push(item)
    }
    
    // 3. Calculate portfolio value
    const collectionsResult = []
    let totalFloorTon = null
    let totalAvgSoldTon = null
    for (const [addr, group] of byCollection) {
      const count = group.items.length
      const floor = group.stats?.floorTon ?? group.info?.floor ?? null
      const avg = group.stats?.avgSoldTon ?? null
      const median = group.stats?.medianSoldTon ?? null

      const valueFloor = floor === null ? null : count * floor
      const valueAvg = avg === null ? null : count * avg
      const valueMedian = median === null ? null : count * median

      if (valueFloor !== null) totalFloorTon = (totalFloorTon ?? 0) + valueFloor
      const picked = valueMedian ?? valueAvg
      if (picked !== null) totalAvgSoldTon = (totalAvgSoldTon ?? 0) + picked

      collectionsResult.push({
        collectionAddress: addr,
        sampleName: group.name,
        sampleImage: group.image ?? group.items[0]?.image ?? null,
        count,
        floorTon: floor,
        avgSoldTon: avg,
        medianSoldTon: median,
        valueFloorTon: valueFloor,
        valueAvgSoldTon: valueAvg,
        valueMedianSoldTon: valueMedian,
        salesCount: group.stats?.salesCount ?? group.info?.sales_count ?? null,
        lastSoldAt: group.stats?.lastSoldAt ?? null
      })
    }
    
    // Sort by value desc
    collectionsResult.sort((a, b) => (b.valueFloorTon ?? -1) - (a.valueFloorTon ?? -1))

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

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' })
})

// Catch-all handler to serve the React app for any non-API routes
app.get(/^(?!\/api).*/, (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(path.join(distDir, 'index.html'))
})
