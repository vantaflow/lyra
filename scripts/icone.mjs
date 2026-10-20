// Génère les icônes depuis build/icon.svg (grande) et build/icon-small.svg (petites tailles) : `node scripts/icone.mjs`
//  - build/icon.png  1024 px : source des paquets (electron-builder en tire .icns et .ico) et icône de fenêtre
//  - build/icon.ico  16 à 256 px (PNG embarqués) : exécutable, raccourci et installateur Windows
//  - src/renderer/public/favicon.png  64 px : favicon des pages lyra://
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { assemblerIco, TAILLES_ICO, TAILLE_MAX_PETITE } from './ico.mjs'

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const build = resolve(racine, 'build')
const png = (svg, taille) => sharp(resolve(build, svg), { density: 72 }).resize(taille, taille).png({ compressionLevel: 9 }).toBuffer()

writeFileSync(resolve(build, 'icon.png'), await png('icon.svg', 1024))
console.log('build/icon.png écrit')

const entrees = []
for (const t of TAILLES_ICO) entrees.push({ taille: t, png: await png(t <= TAILLE_MAX_PETITE ? 'icon-small.svg' : 'icon.svg', t) })
writeFileSync(resolve(build, 'icon.ico'), assemblerIco(entrees))
console.log(`build/icon.ico écrit (${TAILLES_ICO.join(', ')} px)`)

mkdirSync(resolve(racine, 'src/renderer/public'), { recursive: true })
writeFileSync(resolve(racine, 'src/renderer/public/favicon.png'), await png('icon-small.svg', 64))
console.log('src/renderer/public/favicon.png écrit')
