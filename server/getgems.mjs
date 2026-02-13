import axios from 'axios'

const BASE_URL = 'https://api.getgems.io/public-api'

export function createGetgemsClient({ apiKey }) {
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

  return {
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
  }
}

