/**
 * Navigateur ouvert sous Windows : certains fichiers sont verrouillés (EBUSY/EPERM à la copie). Le système de
 * fichiers est simulé : seuls `History` et les fichiers de session sont « verrouillés », le reste se copie normalement.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detecterProfils } from './detection'
import { estIndisponible } from './types'

const verrous = vi.hoisted(() => ({ code: 'EBUSY' as string, motif: /History$|Session_\d+$/ }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const reel = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...reel,
    copyFile: (source: string, destination: string, ...reste: unknown[]) => {
      if (verrous.motif.test(String(source))) return Promise.reject(Object.assign(new Error(`${verrous.code}: resource busy or locked, copyfile '${source}'`), { code: verrous.code }))
      return (reel.copyFile as (...a: unknown[]) => Promise<void>)(source, destination, ...reste)
    }
  }
})

const FIXTURES = fileURLToPath(new URL('./fixtures/chromium', import.meta.url))

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-verrou-'))
  verrous.code = 'EBUSY'
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('navigateur ouvert (fichier verrouillé)', () => {
  it.each(['EBUSY', 'EPERM', 'EACCES'])('%s sur Windows : Indisponible « Fermez Chrome puis réessayez », le reste est lu, rien ne traîne', async (code) => {
    verrous.code = code
    const { lireProfilChromium } = await import('./chromium')
    const [profil] = await detecterProfils({ racines: { chrome: join(FIXTURES, 'chrome') }, navigateurs: ['chrome'] })
    const r = await lireProfilChromium(profil, { elements: ['historique', 'onglets', 'favoris', 'reglages'], dossierTemp: tmp, plateforme: 'win32' })
    expect(estIndisponible(r.donnees.historique) && r.donnees.historique.raison).toBe('History est verrouillé : fermez Chrome puis réessayez.')
    expect(estIndisponible(r.donnees.onglets) && r.donnees.onglets.raison).toBe('Les onglets ouverts de Chrome ne sont lisibles que navigateur fermé : fermez Chrome puis réessayez.')
    expect(estIndisponible(r.donnees.favoris)).toBe(false)
    expect(estIndisponible(r.donnees.reglages)).toBe(false)
    expect(readdirSync(tmp)).toEqual([])
  })
})
