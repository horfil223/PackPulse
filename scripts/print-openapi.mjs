import https from 'node:https'
import util from 'node:util'

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const chunks = []
        res.on('data', (d) => chunks.push(d))
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch (e) {
            reject(e)
          }
        })
      })
      .on('error', reject)
  })
}

const docUrl = 'https://api.getgems.io/public-api/docs.json'
const openapi = await getJson(docUrl)

const paths = Object.keys(openapi.paths ?? {})
const interesting = paths
  .filter(
  (p) =>
    p.includes('/nfts/') ||
    p.includes('/collections/') ||
    p.includes('/history') ||
    p.includes('floor') ||
    p.includes('owner'),
  )
  .sort()

console.log(`openapi: ${openapi.openapi}`)
console.log(`paths: ${paths.length}`)
console.log('--- sample ---')
interesting.forEach((p) => console.log(p))

const show = [
  '/v1/nfts/owner/{ownerAddress}',
  '/v1/nfts/on-sale/{collectionAddress}',
  '/v1/nfts/collection/{collectionAddress}/owner/{ownerAddress}',
  '/v1/nft/history/{nftAddress}',
  '/v1/collection/history/{collectionAddress}',
  '/v1/nfts/history/stickers',
  '/v1/collections/top',
]

console.log('--- details ---')
for (const p of show) {
  const entry = openapi.paths?.[p]
  if (!entry) continue
  console.log(`\n${p}`)
  console.log(util.inspect(entry, { depth: 4, colors: false, maxArrayLength: 20 }))
}

function resolveRef(ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null
  const parts = ref.slice(2).split('/')
  let cur = openapi
  for (const part of parts) {
    cur = cur?.[part]
  }
  return cur ?? null
}

function getJsonSchema(pathKey) {
  const entry = openapi.paths?.[pathKey]?.get
  const schema = entry?.responses?.['200']?.content?.['application/json']?.schema
  if (!schema) return null
  if (schema.$ref) return resolveRef(schema.$ref)
  return schema
}

console.log('--- 200 schemas ---')
for (const p of show) {
  const schema = getJsonSchema(p)
  if (!schema) continue
  console.log(`\n${p}`)
  console.log(util.inspect(schema, { depth: 6, colors: false, maxArrayLength: 50 }))
}

const schemaNames = [
  'NftItemFull',
  'FixPriceSale',
  'Auction',
  'NftItemHistory',
  'NftItemHistoryItem',
  'NftItemAttribute',
  'HistoryTypeSold',
  'HistoryTypePutUpForSale',
  'HistoryTypePutUpForAuction',
]
console.log('--- component schemas ---')
for (const name of schemaNames) {
  const schema = openapi.components?.schemas?.[name]
  if (!schema) continue
  console.log(`\n${name}`)
  console.log(util.inspect(schema, { depth: 8, colors: false, maxArrayLength: 80 }))
}
