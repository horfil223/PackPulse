import axios from 'axios'

const BASE_URL = 'https://api.getgems.io/public-api'

export function createGetgemsClient(arg) {
  const apiKey = typeof arg === 'string' ? arg : arg?.apiKey
  if (!apiKey) {
    throw new Error('GETGEMS_API_KEY is missing')
  }

  const authHeader = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`

  const http = axios.create({
    baseURL: BASE_URL,
    timeout: 20_000,
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
  })

  async function get(path, params) {
    try {
      const res = await http.get(path, { params })
      if (!res.data?.success) {
        const hint =
          typeof res.data?.error === 'string'
            ? res.data.error
            : typeof res.data?.message === 'string'
              ? res.data.message
              : null
        throw new Error(hint ? `Getgems error for ${path}: ${hint}` : `Getgems API error for ${path}`)
      }
      return res.data.response
    } catch (e) {
      if (!e?.response) throw e
      const status = e?.response?.status
      const data = e?.response?.data
      const hint =
        typeof data?.error === 'string'
          ? data.error
          : typeof data?.message === 'string'
            ? data.message
            : typeof data === 'string'
              ? data
              : null
      const msg = hint ? `Getgems ${status ?? ''} ${path}: ${hint}`.trim() : `Getgems request failed ${path}`
      const err = new Error(msg)
      err.response = e?.response
      throw err
    }
  }

  const state = {
    collections: new Map(),
    stats: {
      pagesScanned: 0,
      eventsScanned: 0,
    },
  }

  function pickTimeMs(ev) {
    if (typeof ev?.date === 'number') return ev.date * 1000
    if (typeof ev?.time === 'number') return ev.time * 1000
    if (typeof ev?.timestamp === 'number') return ev.timestamp * 1000
    return null
  }

  function pickCollection(ev) {
    return (
      ev?.collection ??
      ev?.nft?.collection ??
      ev?.item?.collection ??
      ev?.nftItem?.collection ??
      null
    )
  }

  function pickNft(ev) {
    return ev?.nft ?? ev?.item ?? ev?.nftItem ?? ev ?? null
  }

  function pickPriceNano(ev) {
    const td = ev?.typeData ?? ev?.data ?? ev?.price ?? null
    const raw =
      td?.priceNano ??
      td?.price_nano ??
      td?.price ??
      ev?.priceNano ??
      ev?.price_nano ??
      ev?.price ??
      null
    const num = Number(raw)
    return Number.isFinite(num) ? num : null
  }

  function median(nums) {
    const arr = nums.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b)
    if (!arr.length) return null
    const mid = Math.floor(arr.length / 2)
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2
  }

  function getNextCursor(page) {
    return page?.next ?? page?.after ?? page?.cursor ?? page?.nextCursor ?? null
  }

  return {
    stats: state.stats,

    async getOwnerNfts(ownerAddress, { after, limit } = {}) {
      return get(`/v1/nfts/owner/${ownerAddress}`, { after, limit })
    },

    async getNftsOnSale(collectionAddress, { after, limit } = {}) {
      return get(`/v1/nfts/on-sale/${collectionAddress}`, { after, limit })
    },

    async getCollectionNfts(collectionAddress, { after, limit } = {}) {
      return get(`/v1/nfts/collection/${collectionAddress}`, { after, limit })
    },

    async getCollectionHistory(collectionAddress, { minTime, maxTime, after, limit, types, reverse } = {}) {
      const typesParam = Array.isArray(types) ? types.join(',') : types
      return get(`/v1/collection/history/${collectionAddress}`, {
        minTime,
        maxTime,
        after,
        limit,
        types: typesParam,
        reverse,
      })
    },

    async getStickersHistory({ minTime, maxTime, after, limit, types, reverse } = {}) {
      const typesParam = Array.isArray(types) ? types.join(',') : types
      return get('/v1/nfts/history/stickers', { minTime, maxTime, after, limit, types: typesParam, reverse })
    },

    async getCollectionsTop({ after, limit } = {}) {
      return get('/v1/collections/top', { after, limit })
    },

    async testConnection() {
      return this.getCollectionsTop({ limit: 1 })
    },

    getUniqueCollections() {
      return state.collections
    },

    getCollectionStats(collectionAddress) {
      return state.collections.get(collectionAddress) ?? null
    },

    async scanMarketHistory(limitPages = 5) {
      let after = undefined
      for (let i = 0; i < Number(limitPages || 0); i++) {
        const page = await this.getStickersHistory({ after, limit: 100 })
        const items = Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : []

        state.stats.pagesScanned += 1
        state.stats.eventsScanned += items.length

        for (const ev of items) {
          const col = pickCollection(ev)
          const address = col?.address ?? col?.collectionAddress ?? null
          if (!address) continue

          const name = col?.name ?? col?.title ?? null
          const nft = pickNft(ev)
          const image = nft?.image ?? nft?.preview ?? nft?.icon ?? null
          const timeMs = pickTimeMs(ev)
          const priceNano = pickPriceNano(ev)

          let entry = state.collections.get(address)
          if (!entry) {
            entry = {
              sampleName: name,
              displayName: name,
              sampleImage: image,
              floorTon: null,
              avgSoldTon: null,
              medianSoldTon: null,
              salesCount: 0,
              volumeSoldTon: null,
              lastSoldAt: null,
              oldestEventAt: null,
              totalEventsChecked: 0,
              _sold: [],
              _volumeNano: 0,
              _oldestMs: null,
              _latestMs: null,
            }
            state.collections.set(address, entry)
          }

          entry.totalEventsChecked = (entry.totalEventsChecked ?? 0) + 1
          if (!entry.sampleName && name) entry.sampleName = name
          if (!entry.displayName && name) entry.displayName = name
          if (!entry.sampleImage && image) entry.sampleImage = image

          if (timeMs !== null) {
            if (entry._oldestMs === null || timeMs < entry._oldestMs) entry._oldestMs = timeMs
            if (entry._latestMs === null || timeMs > entry._latestMs) entry._latestMs = timeMs
          }

          if (priceNano !== null) {
            entry.salesCount = (entry.salesCount ?? 0) + 1
            entry._sold.push(priceNano / 1e9)
            entry._volumeNano += priceNano
          }
        }

        after = getNextCursor(page)
        if (!after) break
      }

      for (const entry of state.collections.values()) {
        const sold = entry._sold
        entry.volumeSoldTon = entry.salesCount ? entry._volumeNano / 1e9 : null
        entry.avgSoldTon = sold.length ? sold.reduce((a, b) => a + b, 0) / sold.length : null
        entry.medianSoldTon = median(sold)
        entry.lastSoldAt = entry._latestMs !== null ? new Date(entry._latestMs).toISOString() : null
        entry.oldestEventAt = entry._oldestMs !== null ? new Date(entry._oldestMs).toISOString() : null

        delete entry._sold
        delete entry._volumeNano
        delete entry._oldestMs
        delete entry._latestMs
      }

      return {
        pagesScanned: state.stats.pagesScanned,
        eventsScanned: state.stats.eventsScanned,
        uniqueCollections: state.collections.size,
      }
    },

    async getUserStickers(ownerAddress) {
      const items = []
      let after = undefined
      for (let i = 0; i < 50; i++) {
        const page = await this.getOwnerNfts(ownerAddress, { after, limit: 100 })
        const batch = Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : []
        items.push(...batch)
        after = getNextCursor(page)
        if (!after || !batch.length) break
      }
      return items
    },
  }
}

