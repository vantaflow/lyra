import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { cheminIcone, optionIconeFenetre } from './icone'

describe('cheminIcone', () => {
  it('empaquetée : ressource à côté de l\'asar', () => {
    expect(cheminIcone(true, '/R/Resources', '/R/Resources/app.asar')).toBe(join('/R/Resources', 'icon.png'))
  })
  it('en développement : build/icon.png du dépôt', () => {
    expect(cheminIcone(false, '/x', '/depot')).toBe(join('/depot', 'build', 'icon.png'))
  })
})

describe('optionIconeFenetre', () => {
  it('Windows et Linux reçoivent l\'icône, macOS non', () => {
    expect(optionIconeFenetre('win32', '/i.png')).toEqual({ icon: '/i.png' })
    expect(optionIconeFenetre('linux', '/i.png')).toEqual({ icon: '/i.png' })
    expect(optionIconeFenetre('darwin', '/i.png')).toEqual({})
  })
})

describe('fichiers d\'icône du dépôt', () => {
  const lire = (p: string): Buffer => readFileSync(resolve(__dirname, '../..', p))
  it('build/icon.png fait au moins 512 px (electron-builder exige 512 pour l\'.icns)', () => {
    const png = lire('build/icon.png')
    expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(512)
    expect(png.readUInt32BE(20)).toBe(png.readUInt32BE(16))
  })
  it('build/icon.ico contient une image de 256 px et des petites tailles', () => {
    const ico = lire('build/icon.ico')
    expect(ico.readUInt16LE(2)).toBe(1)
    const n = ico.readUInt16LE(4)
    const tailles = Array.from({ length: n }, (_, i) => ico.readUInt8(6 + 16 * i) || 256)
    expect(tailles).toEqual([16, 24, 32, 48, 64, 128, 256])
  })
  it('le favicon des pages lyra:// existe et fait 64 px', () => {
    const png = lire('src/renderer/public/favicon.png')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([64, 64])
  })
})
