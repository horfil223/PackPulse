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
const paths = Object.keys(openapi.paths ?? {}).sort()
const interesting = paths.filter((p) => /collection|collections|sticker|stickers|gift|gifts/i.test(p))
fs.writeFileSync(new URL('./openapi-paths.txt', import.meta.url), interesting.join('\n'), 'utf8')
process.stdout.write('ok\n')
