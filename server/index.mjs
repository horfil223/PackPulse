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
let getgemsInitError = null
try {
  getgems = createGetgemsClient({ apiKey: process.env.GETGEMS_API_KEY })
} catch (e) {
  getgemsInitError = e?.message ?? 'Getgems init failed'
}

function ensureGetgems() {
  if (!getgems) throw new Error(getgemsInitError ?? 'GETGEMS_API_KEY is missing')
  return getgems
}

const cache = {
  marketStickerpacks: { ts: 0, data: null, ttlMs: 2 * 60 * 1000 },
  stickerCollections: { ts: 0, data: null, ttlMs: 2 * 60 * 1000 },
  stickerCollectionsFull: {
    ttlMs: 60 * 60 * 1000,
    startedAt: null,
    updatedAt: null,
    cursor: null,
    done: false,
    pagesScanned: 0,
    eventsScanned: 0,
    collectionSet: new Set(),
  },
  collectionStats: { ttlMs: 5 * 60 * 1000, map: new Map() },
}

function normalizeStickerpackName(name) {
  if (!name || typeof name !== 'string') return null
  const trimmed = name.trim()
  const withoutNumber = trimmed
    .replace(/\s*(#|№)\s*\d+\s*$/u, '')
    .replace(/\s+\d+\s*$/u, '')
    .trim()
  return withoutNumber || trimmed
}

function nanoToTon(nano) {
  const n = typeof nano === 'string' ? Number(nano) : nano
  if (!Number.isFinite(n)) return null
  return n / 1_000_000_000
}

function minNano(values) {
  let best = null
  for (const v of values) {
    const n = typeof v === 'string' ? Number(v) : v
    if (!Number.isFinite(n)) continue
    if (best === null || n < best) best = n
  }
  return best
}

function avgNano(values) {
  let sum = 0
  let count = 0
  for (const v of values) {
    const n = typeof v === 'string' ? Number(v) : v
    if (!Number.isFinite(n)) continue
    sum += n
    count += 1
  }
  if (count === 0) return null
  return Math.round(sum / count)
}

function medianNano(values) {
  const nums = values
    .map((v) => (typeof v === 'string' ? Number(v) : v))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  if (nums.length === 0) return null
  const mid = Math.floor(nums.length / 2)
  if (nums.length % 2 === 1) return nums[mid]
  return Math.round((nums[mid - 1] + nums[mid]) / 2)
}

function parseEventTimeMs(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000
  }
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n) && value.trim() !== '') return n > 1e12 ? n : n * 1000
    const t = Date.parse(value)
    return Number.isFinite(t) ? t : null
  }
  return null
}

function pickEventTimeMs(item) {
  if (!item || typeof item !== 'object') return null
  const candidates = [item.time, item.timestamp, item.createdAt, item.happenedAt, item.at, item.date]
  for (const c of candidates) {
    const ms = parseEventTimeMs(c)
    if (ms !== null) return ms
  }
  return null
}

async function getAllOwnerNfts(ownerAddress, { pageLimit = 50, maxItems = 2000 } = {}) {
  const gg = ensureGetgems()
  const items = []
  let after = undefined

  for (;;) {
    const page = await gg.getOwnerNfts(ownerAddress, { after, limit: pageLimit })
    items.push(...(page.items ?? []))
    after = page.cursor ?? null
    if (!after) break
    if (items.length >= maxItems) break
  }

  return items.slice(0, maxItems)
}

function isOffchainSticker(nft) {
  return nft?.kind === 'OffchainSticker'
}

function isOnchainStickerCandidate(nft) {
  return nft?.kind === 'CollectionItem' && Boolean(nft?.collectionAddress)
}

async function computeCollectionFloorNano(collectionAddress) {
  const gg = ensureGetgems()
  const page = await gg.getNftsOnSale(collectionAddress, { limit: 50 })
  const prices = (page.items ?? [])
    .map((it) => it?.sale)
    .filter((sale) => sale?.type === 'FixPriceSale' && sale?.currency === 'TON')
    .map((sale) => sale.fullPrice)
  return minNano(prices)
}

async function computeCollectionAvgSoldNano(collectionAddress) {
  const gg = ensureGetgems()
  const page = await gg.getCollectionHistory(collectionAddress, { limit: 50, types: 'Sold' })
  const sold = (page.items ?? [])
    .filter((it) => (typeof it?.type === 'string' ? it.type === 'Sold' : true))
    .map((it) => it?.typeData)
    .filter((t) => t && typeof t === 'object' && t.currency === 'TON' && Number.isFinite(Number(t.priceNano)))
    .map((t) => Number(t.priceNano))
  return avgNano(sold)
}

async function computeCollectionSalesStats(collectionAddress) {
  const gg = ensureGetgems()
  // Fetch history without 'types' filter to avoid potential API 400 errors or incorrect filtering on server side
  // We will filter by 'Sold' type manually
  const page = await gg.getCollectionHistory(collectionAddress, { limit: 50 })
  const sold = []
  let volumeNano = 0
  let lastSoldAtMs = null
  let oldestEventMs = null

  const items = page.items ?? []
  for (const it of items) {
    const ms = pickEventTimeMs(it)
    if (ms !== null) {
        if (oldestEventMs === null || ms < oldestEventMs) oldestEventMs = ms
    }

    // Check for sale event. The type is inside typeData and is lowercase 'sold'
    if (it?.typeData?.type !== 'sold') continue
    const t = it?.typeData
    if (!t || typeof t !== 'object' || t.currency !== 'TON') continue
    const priceNano = Number(t.priceNano)
    if (!Number.isFinite(priceNano)) continue
    sold.push(priceNano)
    volumeNano += priceNano
    if (ms !== null && (lastSoldAtMs === null || ms > lastSoldAtMs)) lastSoldAtMs = ms
  }

  return {
    salesCount: sold.length,
    totalEventsChecked: items.length,
    oldestEventAt: oldestEventMs !== null ? new Date(oldestEventMs).toISOString() : null,
    volumeSoldNano: sold.length ? volumeNano : null,
    volumeSoldTon: sold.length ? nanoToTon(volumeNano) : null,
    avgSoldNano: avgNano(sold),
    avgSoldTon: nanoToTon(avgNano(sold)),
    medianSoldNano: medianNano(sold),
    medianSoldTon: nanoToTon(medianNano(sold)),
    lastSoldAt: lastSoldAtMs !== null ? new Date(lastSoldAtMs).toISOString() : null,
  }
}

async function getStickerCollectionAddresses({ maxPages = 12 } = {}) {
  const gg = ensureGetgems()
  const now = Date.now()
  const cached = cache.stickerCollections
  if (cached.data && now - cached.ts < cached.ttlMs) return cached.data

  const set = new Set()
  let after = undefined
  let pages = 0
  let events = 0

  for (;;) {
    const page = await gg.getStickersHistory({ after, limit: 50 })
    const items = page.items ?? []
    events += Array.isArray(items) ? items.length : 0
    for (const it of items) {
      const c = it?.collectionAddress
      if (c) set.add(c)
    }
    after = page.cursor ?? null
    pages += 1
    if (!after) break
    if (pages >= maxPages) break
  }

  const data = {
    updatedAt: new Date().toISOString(),
    pagesScanned: pages,
    eventsScanned: events,
    collectionAddresses: Array.from(set),
  }
  cached.data = data
  cached.ts = now
  return data
}

function getStickerCollectionsFullState() {
  const s = cache.stickerCollectionsFull
  if (!s.startedAt) {
    s.startedAt = new Date().toISOString()
    s.updatedAt = s.startedAt
    s.cursor = undefined
    s.done = false
    s.pagesScanned = 0
    s.eventsScanned = 0
    s.collectionSet = new Set()
  }
  return s
}

async function scanStickerCollectionsFull({ pages = 5 } = {}) {
  const gg = ensureGetgems()
  const s = getStickerCollectionsFullState()
  if (s.done) return s

  for (let i = 0; i < pages; i += 1) {
    const page = await gg.getStickersHistory({ after: s.cursor ?? undefined, limit: 50 })
    const items = page.items ?? []
    s.eventsScanned += Array.isArray(items) ? items.length : 0
    for (const it of items) {
      const c = it?.collectionAddress
      if (c) s.collectionSet.add(c)
    }
    s.cursor = page.cursor ?? null
    s.pagesScanned += 1
    s.updatedAt = new Date().toISOString()
    if (!s.cursor) {
      s.done = true
      break
    }
  }

  return s
}

async function getCollectionStatsCached(collectionAddress) {
  const now = Date.now()
  const cacheEntry = cache.collectionStats
  const entry = cacheEntry.map.get(collectionAddress)
  if (entry && now - entry.ts < cacheEntry.ttlMs) return entry.data

  const gg = ensureGetgems()
  const [floorRes, salesRes, sampleRes] = await Promise.allSettled([
    computeCollectionFloorNano(collectionAddress),
    computeCollectionSalesStats(collectionAddress),
    (async () => {
      const page = await gg.getCollectionNfts(collectionAddress, { limit: 1 })
      const it = page.items?.[0]
      return {
        sampleName: it?.name ?? null,
        sampleImage: it?.imageSizes?.['96'] ?? it?.image ?? null,
      }
    })(),
  ])

  const floorNano = floorRes.status === 'fulfilled' ? floorRes.value : null
  if (salesRes.status === 'rejected') {
    console.error(`[Stats] Sales stats failed for ${collectionAddress}:`, salesRes.reason)
  }
  const sales =
    salesRes.status === 'fulfilled'
      ? salesRes.value
      : {
          salesCount: 0,
          volumeSoldNano: null,
          volumeSoldTon: null,
          avgSoldNano: null,
          avgSoldTon: null,
          medianSoldNano: null,
          medianSoldTon: null,
          lastSoldAt: null,
          oldestEventAt: null,
          totalEventsChecked: 0,
        }
  const sample =
    sampleRes.status === 'fulfilled'
      ? sampleRes.value
      : {
          sampleName: null,
          sampleImage: null,
        }

  const data = {
    collectionAddress,
    floorNano,
    floorTon: nanoToTon(floorNano),
    salesCount: sales.salesCount,
    volumeSoldNano: sales.volumeSoldNano,
    volumeSoldTon: sales.volumeSoldTon,
    avgSoldNano: sales.avgSoldNano,
    avgSoldTon: sales.avgSoldTon,
    medianSoldNano: sales.medianSoldNano,
    medianSoldTon: sales.medianSoldTon,
    lastSoldAt: sales.lastSoldAt,
    oldestEventAt: sales.oldestEventAt,
    totalEventsChecked: sales.totalEventsChecked,
    sampleName: sample.sampleName,
    displayName: normalizeStickerpackName(sample.sampleName),
    sampleImage: sample.sampleImage,
  }

  cacheEntry.map.set(collectionAddress, { ts: now, data })
  return data
}

async function getStickerpacksMarket({ limit = 40 } = {}) {
  const now = Date.now()
  const cached = cache.marketStickerpacks
  if (cached.data && now - cached.ts < cached.ttlMs) return cached.data

  const stickerList = await getStickerCollectionAddresses()
  const { collectionAddresses, pagesScanned, eventsScanned } = stickerList
  const targets = collectionAddresses.slice(0, Math.max(1, limit))

  const collections = await Promise.all(targets.map((collectionAddress) => getCollectionStatsCached(collectionAddress)))

  const data = {
    updatedAt: new Date().toISOString(),
    source: {
      pagesScanned,
      eventsScanned,
      uniqueCollections: collectionAddresses.length,
      returnedCollections: collections.length,
    },
    collections,
  }
  cached.data = data
  cached.ts = now
  return data
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.get('/tonconnect-manifest.json', (req, res) => {
  // Use HOST header to determine the correct domain (works for localhost, Koyeb, Render, etc)
  const host = req.headers.host || 'localhost:3002'
  const protocol = req.headers['x-forwarded-proto'] || 'http'
  const origin = `${protocol}://${host}`

  res.json({
    url: origin,
    name: 'PackPulse',
    iconUrl: `${origin}/tonconnect-icon.svg`,
    termsOfUseUrl: origin,
    privacyPolicyUrl: origin,
  })
})

app.get('/api/diag/getgems', async (req, res) => {
  try {
    const gg = ensureGetgems()
    const page = await gg.getStickersHistory({ limit: 1 })
    res.json({
      ok: true,
      stickersHistory: {
        cursor: page.cursor ?? null,
        items: Array.isArray(page.items) ? page.items.length : 0,
      },
    })
  } catch (e) {
    const status = e?.response?.status
    res.status(typeof status === 'number' ? status : 500).json({ ok: false, error: e?.message ?? 'Unknown error' })
  }
})

app.get('/api/market/stickerpacks', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 40)))
    const mode = String(req.query.mode || 'active')
    if (mode === 'full') {
      const s = getStickerCollectionsFullState()
      const addresses = Array.from(s.collectionSet)
      const targets = addresses.slice(0, Math.max(1, limit))
      const collections = await Promise.all(targets.map((a) => getCollectionStatsCached(a)))
      res.json({
        updatedAt: new Date().toISOString(),
        mode: 'full',
        scan: {
          startedAt: s.startedAt,
          updatedAt: s.updatedAt,
          done: s.done,
          pagesScanned: s.pagesScanned,
          eventsScanned: s.eventsScanned,
          uniqueCollections: s.collectionSet.size,
        },
        collections,
      })
      return
    }

    const data = await getStickerpacksMarket({ limit })
    res.json({ ...data, mode: 'active' })
  } catch (e) {
    const status = e?.response?.status
    res.status(typeof status === 'number' ? status : 500).json({ error: e?.message ?? 'Unknown error' })
  }
})

app.post('/api/market/stickerpacks/scan', async (req, res) => {
  try {
    const pages = Math.min(50, Math.max(1, Number(req.query.pages || 10)))
    const s = await scanStickerCollectionsFull({ pages })
    res.json({
      ok: true,
      scan: {
        startedAt: s.startedAt,
        updatedAt: s.updatedAt,
        done: s.done,
        pagesScanned: s.pagesScanned,
        eventsScanned: s.eventsScanned,
        uniqueCollections: s.collectionSet.size,
      },
    })
  } catch (e) {
    const status = e?.response?.status
    res.status(typeof status === 'number' ? status : 500).json({ ok: false, error: e?.message ?? 'Unknown error' })
  }
})

app.get('/api/portfolio', async (req, res) => {
  try {
    const ownerAddress = String(req.query.ownerAddress || '').trim()
    if (!ownerAddress) {
      res.status(400).json({ error: 'ownerAddress is required' })
      return
    }

    const allNfts = await getAllOwnerNfts(ownerAddress)
    const { collectionAddresses } = await getStickerCollectionAddresses()
    const stickerCollectionSet = new Set(collectionAddresses)

    const stickerNfts = allNfts.filter((nft) => {
      if (isOffchainSticker(nft)) return true
      if (isOnchainStickerCandidate(nft) && stickerCollectionSet.has(nft.collectionAddress)) return true
      return false
    })

    const byCollection = new Map()
    for (const nft of stickerNfts) {
      const c = nft.collectionAddress ?? 'unknown'
      const arr = byCollection.get(c) ?? []
      arr.push(nft)
      byCollection.set(c, arr)
    }

    const collections = await Promise.all(
      Array.from(byCollection.entries()).map(async ([collectionAddress, nfts]) => {
        const stats = collectionAddress === 'unknown' ? null : await getCollectionStatsCached(collectionAddress)
        const floorNano = stats?.floorNano ?? null
        const avgSoldNano = stats?.avgSoldNano ?? null
        const medianSoldNano = stats?.medianSoldNano ?? null
        const salesCount = stats?.salesCount ?? 0
        const lastSoldAt = stats?.lastSoldAt ?? null

        const count = nfts.length
        const valueFloorNano = floorNano !== null ? floorNano * count : null
        const valueAvgSoldNano = avgSoldNano !== null ? avgSoldNano * count : null
        const valueMedianSoldNano = medianSoldNano !== null ? medianSoldNano * count : null

        const sample = nfts[0]
        return {
          collectionAddress,
          count,
          sampleName: sample?.name ?? null,
          displayName: normalizeStickerpackName(sample?.name ?? null),
          sampleImage: sample?.imageSizes?.['96'] ?? sample?.image ?? null,
          floorNano,
          floorTon: nanoToTon(floorNano),
          avgSoldNano,
          avgSoldTon: nanoToTon(avgSoldNano),
          medianSoldNano,
          medianSoldTon: nanoToTon(medianSoldNano),
          salesCount,
          lastSoldAt,
          valueFloorNano,
          valueFloorTon: nanoToTon(valueFloorNano),
          valueAvgSoldNano,
          valueAvgSoldTon: nanoToTon(valueAvgSoldNano),
          valueMedianSoldNano,
          valueMedianSoldTon: nanoToTon(valueMedianSoldNano),
        }
      }),
    )

    const totals = collections.reduce(
      (acc, c) => {
        if (typeof c.valueFloorNano === 'number') acc.totalFloorNano += c.valueFloorNano
        if (typeof c.valueAvgSoldNano === 'number') acc.totalAvgSoldNano += c.valueAvgSoldNano
        return acc
      },
      { totalFloorNano: 0, totalAvgSoldNano: 0 },
    )

    res.json({
      ownerAddress,
      updatedAt: new Date().toISOString(),
      counts: {
        nftsTotal: allNfts.length,
        stickersTotal: stickerNfts.length,
        collectionsTotal: collections.length,
      },
      totals: {
        totalFloorTon: nanoToTon(totals.totalFloorNano),
        totalAvgSoldTon: nanoToTon(totals.totalAvgSoldNano),
      },
      collections: collections.sort((a, b) => b.count - a.count),
    })
  } catch (e) {
    const status = e?.response?.status
    res.status(typeof status === 'number' ? status : 500).json({ error: e?.message ?? 'Unknown error' })
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

