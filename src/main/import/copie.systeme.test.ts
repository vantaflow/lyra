/**
 * Système de fichiers simulé : disque plein (ENOSPC) et suppression refusée (EBUSY) du dossier temporaire.
 * La suppression qui échoue ne doit jamais remplacer le résultat de la lecture.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detecterProfils } from './detection'
import { estIndisponible } from './types'

const sim = vi.hoisted(() => ({
  copyFile: undefined as undefined | string, // code d'erreur à lever pour les copies de « History »
  rmEchoue: false,
  appelsRm: [] as Array<{ chemin: string; options: Record<string, unknown> }>
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const reel = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...reel,
    copyFile: (source: string, destination: string, ...reste: unknown[]) => {
      if (sim.copyFile && /History$/.test(String(source))) return Promise.reject(Object.assign(new Error(`${sim.copyFile}: simulé`), { code: sim.copyFile }))
      return (reel.copyFile as (...a: unknown[]) => Promise<void>)(source, destination, ...reste)
    },
    rm: (chemin: string, options: Record<string, unknown> = {}) => {
      sim.appelsRm.push({ chemin: String(chemin), options })
      if (sim.rmEchoue) return Promise.reject(Object.assign(new Error('EBUSY: resource busy or locked, rmdir'), { code: 'EBUSY' }))
      return (reel.rm as (...a: unknown[]) => Promise<void>)(chemin, options)
    }
  }
})

const FIXTURES = fileURLToPath(new URL('./fixtures/chromium', import.meta.url))

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lyra-systeme-'))
  sim.copyFile = undefined
  sim.rmEchoue = false
  sim.appelsRm.length = 0
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const profil = async () => (await detecterProfils({ racines: { chrome: join(FIXTURES, 'chrome') }, navigateurs: ['chrome'] }))[0]

describe('disque plein', () => {
  it('ENOSPC à la copie : message dédié, code « disque-plein », le reste est lu, rien ne traîne', async () => {
    sim.copyFile = 'ENOSPC'
    const { lireProfilChromium } = await import('./chromium')
    const r = await lireProfilChromium(await profil(), { elements: ['historique', 'favoris'], dossierTemp: tmp })
    expect(r.donnees.historique).toEqual({ indisponible: true, code: 'disque-plein', raison: 'Espace disque insuffisant pour copier History : libérez de la place puis réessayez.' })
    expect(estIndisponible(r.donnees.favoris)).toBe(false)
    expect(readdirSync(tmp)).toEqual([])
  })
})

describe('nettoyage qui échoue', () => {
  it('suppression refusée (EBUSY) : la lecture réussit quand même, avec nouvelles tentatives', async () => {
    sim.rmEchoue = true
    const { lireProfilChromium } = await import('./chromium')
    const r = await lireProfilChromium(await profil(), { elements: ['favoris', 'historique'], dossierTemp: tmp, maintenant: Date.parse('2026-10-19T12:00:00Z') })
    expect(estIndisponible(r.donnees.favoris)).toBe(false)
    expect(estIndisponible(r.donnees.historique)).toBe(false)
    expect(sim.appelsRm.length).toBeGreaterThan(0)
    for (const a of sim.appelsRm) expect(a.options).toMatchObject({ recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  })

  it('parcourirHistoriqueChromium : un import réussi n’est pas rapporté « Indisponible » parce que le nettoyage échoue', async () => {
    sim.rmEchoue = true
    const { parcourirHistoriqueChromium } = await import('./chromium')
    const lots: number[] = []
    const r = await parcourirHistoriqueChromium(await profil(), { dossierTemp: tmp, maintenant: Date.parse('2026-10-19T12:00:00Z') }, (lot) => void lots.push(lot.length))
    expect(r).toEqual({ pages: 3, visites: 8 })
    expect(lots).toEqual([3])
  })

  it('une erreur de lecture n’est pas masquée par l’échec du nettoyage', async () => {
    sim.rmEchoue = true
    const { avecCopieur } = await import('./copie')
    await expect(
      avecCopieur(async () => {
        throw new Error("erreur d'origine")
      }, { dossierTemp: tmp })
    ).rejects.toThrow("erreur d'origine")
  })

  it('le dossier resté sur place est rattrapé par balayerOrphelins', async () => {
    sim.rmEchoue = true
    const { lireProfilChromium } = await import('./chromium')
    await lireProfilChromium(await profil(), { elements: ['favoris'], dossierTemp: tmp })
    sim.rmEchoue = false
    const { balayerOrphelins } = await import('./copie')
    expect(await balayerOrphelins({ dossierTemp: tmp, ageMaxMs: 0, maintenant: Date.now() + 10_000 })).toBe(1)
  })
})

describe('balayerOrphelins', () => {
  const vieux = (nom: string, ageMs: number): string => {
    const chemin = join(tmp, nom)
    mkdirSync(join(chemin, '0'), { recursive: true })
    writeFileSync(join(chemin, '0', 'History'), 'copie sensible')
    const date = new Date(Date.now() - ageMs)
    utimesSync(chemin, date, date)
    return chemin
  }

  it('supprime les lyra-import-* de plus d’une heure, garde les récents et tout ce qui n’est pas à nous', async () => {
    const ancien = vieux('lyra-import-AbC123', 2 * 3_600_000)
    const recent = vieux('lyra-import-zzZ999', 5 * 60_000)
    const autreNom = vieux('lyra-import-trop-long-pour-etre-a-nous', 5 * 3_600_000)
    const sansPrefixe = vieux('import-AbC123', 5 * 3_600_000)
    const fichier = join(tmp, 'lyra-import-fichi1')
    writeFileSync(fichier, 'je suis un fichier')
    utimesSync(fichier, new Date(0), new Date(0))
    const { balayerOrphelins } = await import('./copie')
    expect(await balayerOrphelins({ dossierTemp: tmp })).toBe(1)
    expect(existsSync(ancien)).toBe(false)
    for (const gardes of [recent, autreNom, sansPrefixe, fichier]) expect(existsSync(gardes)).toBe(true)
  })

  it('l’âge limite est paramétrable ; dossier temporaire absent : 0, sans exception', async () => {
    const chemin = vieux('lyra-import-Qw3rTy', 10 * 60_000)
    const { balayerOrphelins } = await import('./copie')
    expect(await balayerOrphelins({ dossierTemp: tmp, ageMaxMs: 3_600_000 })).toBe(0)
    expect(await balayerOrphelins({ dossierTemp: tmp, ageMaxMs: 60_000 })).toBe(1)
    expect(existsSync(chemin)).toBe(false)
    expect(await balayerOrphelins({ dossierTemp: join(tmp, 'absent') })).toBe(0)
  })

  it('une suppression refusée n’interrompt pas le balayage et n’est pas comptée', async () => {
    const chemin = vieux('lyra-import-Bl0cke', 2 * 3_600_000)
    sim.rmEchoue = true
    const { balayerOrphelins } = await import('./copie')
    expect(await balayerOrphelins({ dossierTemp: tmp })).toBe(0)
    expect(existsSync(chemin)).toBe(true)
  })
})
