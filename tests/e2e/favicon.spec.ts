import { test, expect } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { deflateSync } from 'node:zlib'
import { lancerLyra } from './helpers'

/** PNG RGBA 16×16 d'une seule couleur (écrit à la main : aucune dépendance). */
function png(r: number, g: number, b: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer): number => {
    let c = 0xffffffff
    for (const o of buf) c = crcTable[(c ^ o) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const bloc = (type: string, data: Buffer): Buffer => {
    const t = Buffer.concat([Buffer.from(type), data])
    const l = Buffer.alloc(4)
    l.writeUInt32BE(data.length)
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(t))
    return Buffer.concat([l, t, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(16, 0)
  ihdr.writeUInt32BE(16, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 16 }, () => [r, g, b, 255]).flat())])
  const brut = Buffer.concat(Array.from({ length: 16 }, () => ligne))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(brut)), bloc('IEND', Buffer.alloc(0))])
}

/** ICO 16×16 dont l'image est un BMP 32 bits (pas un PNG). */
function icoBmp(r: number, g: number, b: number): Buffer {
  const n = 16
  const entete = Buffer.alloc(40)
  entete.writeUInt32LE(40, 0)
  entete.writeInt32LE(n, 4)
  entete.writeInt32LE(n * 2, 8)
  entete.writeUInt16LE(1, 12)
  entete.writeUInt16LE(32, 14)
  const pixels = Buffer.concat(Array.from({ length: n * n }, () => Buffer.from([b, g, r, 255])))
  const masque = Buffer.alloc(4 * n)
  const dib = Buffer.concat([entete, pixels, masque])
  const t = Buffer.alloc(22)
  t.writeUInt16LE(1, 2)
  t.writeUInt16LE(1, 4)
  t[6] = n
  t[7] = n
  t.writeUInt32LE(dib.length, 14)
  t.writeUInt32LE(22, 18)
  return Buffer.concat([t, dib])
}

/** Electron ne télécharge pas lui-même les favicons : seule une icône déjà chargée par la page (ici un <img>) est dans le cache HTTP de la session. */
let serveur: Server
let BASE = ''
const requetesIcones: string[] = []
test.beforeAll(async () => {
  serveur = createServer((q, r) => {
    const url = q.url ?? '/'
    if (url === '/f.png') {
      requetesIcones.push(url)
      r.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=3600' })
      r.end(png(255, 0, 0))
    } else if (url === '/f.ico') {
      requetesIcones.push(url)
      r.writeHead(200, { 'content-type': 'image/x-icon', 'cache-control': 'max-age=3600' })
      r.end(icoBmp(0, 0, 255))
    } else if (url === '/f.svg') {
      requetesIcones.push(url)
      r.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=3600' })
      r.end('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#00ff00"/></svg>')
    } else {
      const m = /^\/page-(png|ico|svg)$/.exec(url)
      r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      r.end(`<!doctype html><title>Favicon</title><link rel="icon" href="/f.${m?.[1] ?? 'png'}"><img src="/f.${m?.[1] ?? 'png'}" width="1" height="1" alt=""><p>page</p>`)
    }
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  BASE = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`
})
test.afterAll(() => serveur.close())

test('favicon : la teinte du ciel vient du favicon en cache (PNG, ICO à BMP embarqué), sans requête réseau supplémentaire ; un SVG est ignoré', async () => {
  test.setTimeout(90_000)
  const { app, fenetre } = await lancerLyra()
  try {
    await fenetre.evaluate(() => window.lyra.invoke('settings:set', { couleurs: { cielTeinteParSite: true } } as never))
    const teintes = (): Promise<string[]> => fenetre.evaluate(() => window.lyra.invoke('sky:get').then((c) => Object.values(c.etats).flatMap((e) => (e.teinteFavicon ? [e.teinteFavicon] : []))))
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/page-png`)
    await expect.poll(teintes, { timeout: 20_000 }).toContain('#FF0000')
    expect(requetesIcones.filter((u) => u === '/f.png')).toHaveLength(1)
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/page-ico`)
    await expect.poll(teintes, { timeout: 20_000 }).toContain('#0000FF')
    expect(requetesIcones.filter((u) => u === '/f.ico')).toHaveLength(1)
    await fenetre.evaluate((u) => window.lyra.invoke('tabs:open', { url: u }), `${BASE}/page-svg`)
    await expect.poll(() => requetesIcones.includes('/f.svg'), { timeout: 20_000 }).toBe(true)
    await new Promise((r) => setTimeout(r, 1500))
    expect(await teintes()).not.toContain('#00FF00')
  } finally {
    await app.close()
  }
})
