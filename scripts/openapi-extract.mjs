import https from 'node:https'
import fs from 'node:fs'

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

const openapi = await getJson('https://api.getgems.io/public-api/docs.json')

const pickPaths = [
  '/v1/nfts/history/stickers',
  '/v1/collections/top',
  '/v1/nfts/list',
  '/v1/gifts/collections/top',
]

const out = {
  openapi: openapi.openapi,
  picked: Object.fromEntries(pickPaths.map((p) => [p, openapi.paths?.[p] ?? null])),
  schemas: {
    NftCollectionInfo: openapi.components?.schemas?.NftCollectionInfo ?? null,
    NftItemFull: openapi.components?.schemas?.NftItemFull ?? null,
    NftItemHistory: openapi.components?.schemas?.NftItemHistory ?? null,
  },
}

fs.writeFileSync(new URL('./openapi-extract.json', import.meta.url), JSON.stringify(out, null, 2), 'utf8')
process.stdout.write('ok\n')
