// Convertit build/icon.svg en build/icon.png (1024x1024) : `node scripts/icone.mjs`
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const build = resolve(dirname(fileURLToPath(import.meta.url)), '../build')
await sharp(resolve(build, 'icon.svg'), { density: 72 }).resize(1024, 1024).png().toFile(resolve(build, 'icon.png'))
console.log('build/icon.png écrit')
