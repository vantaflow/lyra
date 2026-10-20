import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RegleSite } from '../../shared/types'
import { appliquerExclusions, creerSynchroSites, motifsExclusion, SIDECAR_EXCLUSIONS } from './regleSite'

const ID = 'a'.repeat(32)
const AUTRE = 'b'.repeat(32)
const bloque = (id = ID): RegleSite => ({ extensions: { [id]: false } })

describe('motifsExclusion', () => {
  it('traduit origine, hôte et motif en motifs de correspondance', () => {
    const sites = {
      'http://127.0.0.1:8080': bloque(),
      'https://exemple.fr': bloque(),
      'file://': bloque(),
      'youtube.com': bloque(),
      '*.motif.fr': bloque()
    }
    expect(motifsExclusion(sites, ID)).toEqual(['*://*.motif.fr/*', '*://youtube.com/*', 'http://127.0.0.1:8080/*', 'https://exemple.fr/*'])
  })
  it('ignore les autorisations, les autres extensions, les clés invalides et les règles sans extensions', () => {
    const sites = { 'a.fr': { extensions: { [ID]: true } }, 'b.fr': bloque(AUTRE), 'c.fr': { boucliers: 'strict' }, 'pas une clé !': bloque() } as Record<string, RegleSite>
    expect(motifsExclusion(sites, ID)).toEqual([])
  })
  it('est stable : même ensemble, même résultat, sans doublon', () => {
    const a = { 'x.fr': bloque(), 'X.FR': bloque(), 'y.fr': bloque() }
    expect(motifsExclusion(a, ID)).toEqual(['*://x.fr/*', '*://y.fr/*'])
    expect(motifsExclusion({ 'y.fr': bloque(), 'x.fr': bloque() }, ID)).toEqual(motifsExclusion(a, ID))
  })
})

describe('appliquerExclusions', () => {
  let d: string
  const manifest = (): any => JSON.parse(readFileSync(join(d, 'manifest.json'), 'utf8'))
  beforeEach(() => {
    d = mkdtempSync(join(tmpdir(), 'lyra-excl-'))
    writeFileSync(
      join(d, 'manifest.json'),
      JSON.stringify({ manifest_version: 3, name: 'x', content_scripts: [{ matches: ['<all_urls>'], js: ['a.js'], exclude_matches: ['*://deja.fr/*'] }, { matches: ['https://*/*'], js: ['b.js'] }] })
    )
  })
  afterEach(() => rmSync(d, { recursive: true, force: true }))

  it("ajoute les motifs aux exclude_matches de chaque script et garde ceux d'origine", () => {
    expect(appliquerExclusions(d, ['*://x.fr/*'])).toEqual({ concerne: true, modifie: true })
    const m = manifest()
    expect(m.content_scripts[0].exclude_matches).toEqual(['*://deja.fr/*', '*://x.fr/*'])
    expect(m.content_scripts[1].exclude_matches).toEqual(['*://x.fr/*'])
  })
  it('est idempotent et réversible (retour au manifest d’origine)', () => {
    appliquerExclusions(d, ['*://x.fr/*'])
    expect(appliquerExclusions(d, ['*://x.fr/*']).modifie).toBe(false)
    appliquerExclusions(d, ['*://x.fr/*', '*://y.fr/*'])
    expect(manifest().content_scripts[0].exclude_matches).toEqual(['*://deja.fr/*', '*://x.fr/*', '*://y.fr/*'])
    appliquerExclusions(d, [])
    const m = manifest()
    expect(m.content_scripts[0].exclude_matches).toEqual(['*://deja.fr/*'])
    expect(m.content_scripts[1]).not.toHaveProperty('exclude_matches')
  })
  it('ne touche à rien sans motif ni sauvegarde, ni sans content_scripts', () => {
    const avant = readFileSync(join(d, 'manifest.json'), 'utf8')
    expect(appliquerExclusions(d, [])).toEqual({ concerne: true, modifie: false })
    expect(readFileSync(join(d, 'manifest.json'), 'utf8')).toBe(avant)
    expect(existsSync(join(d, SIDECAR_EXCLUSIONS))).toBe(false)
    writeFileSync(join(d, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'x' }))
    expect(appliquerExclusions(d, ['*://x.fr/*'])).toEqual({ concerne: false, modifie: false })
  })
  it('ne plante pas sur un manifest illisible', () => {
    writeFileSync(join(d, 'manifest.json'), '{ pas du json')
    expect(appliquerExclusions(d, ['*://x.fr/*'])).toEqual({ concerne: false, modifie: false })
  })
})

describe('creerSynchroSites', () => {
  const montage = (sites: Record<string, RegleSite>) => {
    let courant = sites
    let abonne: ((s: { sites: Record<string, RegleSite> }) => void) | undefined
    const recharger = vi.fn(async (_id: string) => undefined)
    const dossiers = new Map<string, string>()
    const synchro = creerSynchroSites({
      sites: () => courant,
      surChangement: (cb) => ((abonne = cb), () => undefined),
      chargees: () => [...dossiers.keys()],
      recharger
    })
    return {
      synchro,
      recharger,
      dossiers,
      change: (s: Record<string, RegleSite>) => {
        courant = s
        abonne!({ sites: s })
      }
    }
  }
  const ecrireManifest = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'lyra-sync-'))
    writeFileSync(join(d, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'x', content_scripts: [{ matches: ['<all_urls>'], js: ['a.js'] }] }))
    return d
  }
  it('recharge seulement l’extension chargée dont les motifs changent', async () => {
    const m = montage({})
    const d = ecrireManifest()
    m.dossiers.set(ID, d)
    m.synchro.preparer(ID, d)
    m.change({ 'x.fr': bloque() })
    await new Promise((r) => setTimeout(r, 0))
    expect(m.recharger).toHaveBeenCalledTimes(1)
    expect(m.recharger).toHaveBeenCalledWith(ID)
    // Simule le rechargement : le chargeur rappelle `preparer`.
    m.synchro.preparer(ID, d)
    // Réglage sans effet sur l'ensemble (autre site, autre extension, autre champ) : aucun rechargement.
    m.change({ 'x.fr': bloque(), 'y.fr': { boucliers: 'strict' }, 'z.fr': bloque(AUTRE) })
    await new Promise((r) => setTimeout(r, 0))
    expect(m.recharger).toHaveBeenCalledTimes(1)
    rmSync(d, { recursive: true, force: true })
  })
  it('ne recharge pas une extension sans content_scripts', async () => {
    const m = montage({})
    const d = mkdtempSync(join(tmpdir(), 'lyra-sync-'))
    writeFileSync(join(d, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'x' }))
    m.dossiers.set(ID, d)
    m.synchro.preparer(ID, d)
    m.change({ 'x.fr': bloque() })
    await new Promise((r) => setTimeout(r, 0))
    expect(m.recharger).not.toHaveBeenCalled()
    rmSync(d, { recursive: true, force: true })
  })
})
