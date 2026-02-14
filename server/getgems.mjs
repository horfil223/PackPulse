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

  function shouldRetry(err) {
    const status = err?.response?.status
    if (status === 429) return true
    if (status === 500 || status === 502 || status === 503 || status === 504) return true
    const code = err?.code
    if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN') return true
    return false
  }

  function formatHint(data) {
    if (!data) return null
    if (typeof data?.error === 'string') return data.error
    if (typeof data?.message === 'string') return data.message
    if (typeof data === 'string') return data.slice(0, 400)
    try {
      return JSON.stringify(data).slice(0, 400)
    } catch {
      return null
    }
  }

  async function get(path, params) {
    const delaysMs = [250, 800, 1600]
    for (let attempt = 0; attempt < delaysMs.length + 1; attempt++) {
      try {
        const res = await http.get(path, { params })
        if (!res.data?.success) {
          const hint = formatHint(res.data)
          throw new Error(hint ? `Getgems error for ${path}: ${hint}` : `Getgems API error for ${path}`)
        }
        return res.data.response
      } catch (e) {
        if (attempt < delaysMs.length && shouldRetry(e)) {
          await new Promise((r) => setTimeout(r, delaysMs[attempt]))
          continue
        }

        if (!e?.response) throw e
        const status = e?.response?.status
        const data = e?.response?.data
        const hint = formatHint(data)
        const msg = hint ? `Getgems ${status ?? ''} ${path}: ${hint}`.trim() : `Getgems ${status ?? ''} request failed ${path}`.trim()
        const err = new Error(msg)
        err.response = e?.response
        throw err
      }
    }
  }

  const state = {
    collections: new Map(),
    stats: {
      pagesScanned: 0,
      eventsScanned: 0,
    },
    stickerCollections: {
      fetchedAtMs: 0,
      set: null,
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

    async getStickerCollections({ cursor, limit } = {}) {
      return get('/v1/stickers/collections', { cursor, limit })
    },

    async getCollectionBasicInfo(collectionAddress) {
      return get(`/v1/collection/basic-info/${collectionAddress}`)
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
          const address =
            ev?.collectionAddress ??
            ev?.collection_address ??
            pickCollection(ev)?.address ??
            pickCollection(ev)?.collectionAddress ??
            null
          if (!address) continue

          const rawName = typeof ev?.name === 'string' ? ev.name : null
          const name = rawName ? rawName.replace(/\s*#\d+$/, '') : null
          const image = null
          const timeMs =
            typeof ev?.timestamp === 'number'
              ? ev.timestamp
              : typeof ev?.time === 'string'
                ? Date.parse(ev.time)
                : pickTimeMs(ev)

          const eventType = ev?.typeData?.type ?? ev?.type ?? null
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
              _list: [],
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
            if (eventType === 'sold') {
              entry.salesCount = (entry.salesCount ?? 0) + 1
              entry._sold.push(priceNano / 1e9)
              entry._volumeNano += priceNano
            } else if (eventType === 'putUpForSale') {
              entry._list.push(priceNano / 1e9)
            }
          }
        }

        after = getNextCursor(page)
        if (!after) break
      }

      for (const entry of state.collections.values()) {
        const sold = entry._sold
        const list = entry._list
        entry.floorTon = list.length ? Math.min(...list) : null
        entry.volumeSoldTon = entry.salesCount ? entry._volumeNano / 1e9 : null
        entry.avgSoldTon = sold.length ? sold.reduce((a, b) => a + b, 0) / sold.length : null
        entry.medianSoldTon = median(sold)
        entry.lastSoldAt = entry._latestMs !== null ? new Date(entry._latestMs).toISOString() : null
        entry.oldestEventAt = entry._oldestMs !== null ? new Date(entry._oldestMs).toISOString() : null

        delete entry._sold
        delete entry._list
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

    async getStickerCollectionsSet() {
      const now = Date.now()
      if (state.stickerCollections.set && now - state.stickerCollections.fetchedAtMs < 60 * 60 * 1000) {
        return state.stickerCollections.set
      }

      const set = new Set()
      let cursor = undefined
      for (let i = 0; i < 50; i++) {
        const page = await this.getStickerCollections({ cursor, limit: 200 })
        const items = Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : []
        for (const c of items) {
          const address = c?.address ?? c?.collectionAddress ?? c?.contract_address ?? null
          if (address) set.add(address)
        }
        cursor = getNextCursor(page)
        if (!cursor || !items.length) break
      }

      state.stickerCollections = { fetchedAtMs: now, set }
      return set
    },

    async findStickerCollections(targetAddresses) {
      const targets = new Set(Array.isArray(targetAddresses) ? targetAddresses : [...(targetAddresses ?? [])])
      targets.delete(null)
      targets.delete(undefined)
      targets.delete('unknown')
      if (targets.size === 0) return new Set()

      const found = new Set()
      let cursor = undefined
      for (let i = 0; i < 50; i++) {
        const page = await this.getStickerCollections({ cursor, limit: 200 })
        const items = Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : []
        for (const c of items) {
          const address = c?.address ?? c?.collectionAddress ?? c?.contract_address ?? null
          if (address && targets.has(address)) found.add(address)
        }
        if (found.size === targets.size) break
        cursor = getNextCursor(page)
        if (!cursor || !items.length) break
      }
      return found
    },
  }
}

