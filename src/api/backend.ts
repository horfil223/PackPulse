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
  const url = `/api/portfolio?ownerAddress=${encodeURIComponent(ownerAddress)}`
  const res = await fetch(url)
  if (!res.ok) {
    const msg = await readErrorMessage(res)
    throw new Error(msg ? `Ошибка API: ${msg}` : `API error: ${res.status}`)
  }
  return res.json()
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
  return res.json()
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
  const url = `/api/market/stickerpacks/scan?pages=${encodeURIComponent(String(pages))}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) {
    const msg = await readErrorMessage(res)
    throw new Error(msg ? `Ошибка API: ${msg}` : `API error: ${res.status}`)
  }
  return res.json()
}

