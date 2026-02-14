export interface PortfolioCollection {
  collectionAddress: string
  count: number
  sampleName: string | null
  displayName: string | null
  sampleImage: string | null
  floorTon: number | null
  avgSoldTon: number | null
  medianSoldTon?: number | null
  salesCount?: number
  lastSoldAt?: string | null
  valueFloorTon: number | null
  valueAvgSoldTon: number | null
  valueMedianSoldTon?: number | null
}

export interface PortfolioResponse {
  ownerAddress: string
  updatedAt: string
  counts: {
    nftsTotal: number
    stickersTotal: number
    collectionsTotal: number
  }
  totals: {
    totalFloorTon: number | null
    totalAvgSoldTon: number | null
  }
  collections: PortfolioCollection[]
}

async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const data = await res.json()
    if (data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string') {
      return (data as any).error
    }
    return null
  } catch {
    return null
  }
}

export async function fetchPortfolio(ownerAddress: string): Promise<PortfolioResponse> {
  const url = `/api/portfolio/${encodeURIComponent(ownerAddress)}`
  const res = await fetch(url)
  if (!res.ok) {
    const msg = await readErrorMessage(res)
    throw new Error(msg ? `Ошибка API: ${msg}` : `API error: ${res.status}`)
  }
  const data = await res.json()
  const portfolio = data?.portfolio ?? null
  if (!portfolio || typeof portfolio !== 'object') {
    throw new Error('Ошибка API: Некорректный ответ портфеля')
  }
  const stickersTotal = Number(portfolio?.counts?.stickersTotal ?? 0)
  const collectionsTotal = Number(portfolio?.counts?.collectionsTotal ?? 0)
  return {
    ownerAddress,
    updatedAt: new Date().toISOString(),
    counts: {
      nftsTotal: stickersTotal,
      stickersTotal,
      collectionsTotal,
    },
    totals: {
      totalFloorTon: portfolio?.totals?.totalFloorTon ?? null,
      totalAvgSoldTon: portfolio?.totals?.totalAvgSoldTon ?? null,
    },
    collections: Array.isArray(portfolio?.collections) ? portfolio.collections : [],
  }
}

export interface MarketStickerpack {
  collectionAddress: string
  floorTon: number | null
  avgSoldTon: number | null
  medianSoldTon?: number | null
  salesCount?: number
  volumeSoldTon?: number | null
  lastSoldAt?: string | null
  oldestEventAt?: string | null
  totalEventsChecked?: number
  sampleName: string | null
  displayName: string | null
  sampleImage: string | null
}

export interface MarketStickerpacksResponse {
  updatedAt: string
  mode?: 'active' | 'full'
  source?: {
    pagesScanned: number
    eventsScanned: number
    uniqueCollections: number
    returnedCollections: number
  }
  scan?: {
    startedAt: string | null
    updatedAt: string | null
    done: boolean
    pagesScanned: number
    eventsScanned: number
    uniqueCollections: number
  }
  collections: MarketStickerpack[]
}

export async function fetchMarketStickerpacks(limit = 40, mode: 'active' | 'full' = 'active'): Promise<MarketStickerpacksResponse> {
  const url = `/api/market/stickerpacks?limit=${encodeURIComponent(String(limit))}&mode=${encodeURIComponent(mode)}`
  const res = await fetch(url)
  if (!res.ok) {
    const msg = await readErrorMessage(res)
    throw new Error(msg ? `Ошибка API: ${msg}` : `API error: ${res.status}`)
  }
  const data = await res.json()
  const updatedAt = new Date().toISOString()
  const collections = Array.isArray(data?.collections) ? data.collections : []
  const source = data?.source && typeof data.source === 'object' ? data.source : undefined
  return {
    updatedAt,
    mode,
    source: source
      ? {
          pagesScanned: Number(source.pagesScanned ?? 0),
          eventsScanned: Number(source.eventsScanned ?? 0),
          uniqueCollections: Number(source.uniqueCollections ?? 0),
          returnedCollections: collections.length,
        }
      : undefined,
    scan:
      mode === 'full' && source
        ? {
            startedAt: null,
            updatedAt,
            done: true,
            pagesScanned: Number(source.pagesScanned ?? 0),
            eventsScanned: Number(source.eventsScanned ?? 0),
            uniqueCollections: Number(source.uniqueCollections ?? 0),
          }
        : undefined,
    collections,
  }
}

export interface MarketScanResponse {
  ok: boolean
  scan?: {
    startedAt: string | null
    updatedAt: string | null
    done: boolean
    pagesScanned: number
    eventsScanned: number
    uniqueCollections: number
  }
  error?: string
}

export async function scanMarketStickerpacks(pages = 10): Promise<MarketScanResponse> {
  const url = `/api/market/scan`
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limitPages: pages }) })
  if (!res.ok) {
    const msg = await readErrorMessage(res)
    throw new Error(msg ? `Ошибка API: ${msg}` : `API error: ${res.status}`)
  }
  return res.json()
}

