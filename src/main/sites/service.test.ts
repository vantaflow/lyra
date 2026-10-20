import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerReglages } from '../settings/settings'
import { resoudre } from '../settings/sites'
import type { RegleSite } from '../../shared/types'
import type { OriginesUI } from '../ipc-origines'
import { creerServiceSites, estVueInterne, reglagesHorsSitesChanges } from './service'

const ORIGINES: OriginesUI = { prod: 'file:///app/renderer/' }
interface V { url: string; privee?: boolean; recus: Array<Record<string, RegleSite>> }
const vue = (url: string, privee = false): V => ({ url, privee, recus: [] })

function monter(vues: V[]) {
  const reglages = creerReglages(join(mkdtempSync(join(tmpdir(), 'lyra-sites-')), 'settings.json'), '/tmp/dl')
  const service = creerServiceSites<V & { getURL(): string }>({
    reglages,
    estPrivee: (v) => v.privee === true,
    estInterne: (v) => estVueInterne(v.url, ORIGINES),
    vues: () => vues.map((v) => Object.assign(v, { getURL: () => v.url })),
    envoyer: (v, r) => v.recus.push(r)
  })
  const E = (v: V) => Object.assign(v, { getURL: () => v.url })
  return { reglages, service, E }
}

describe('service sites:*', () => {
  it('écrire/supprimer refusés depuis une fenêtre privée', () => {
    const priv = vue('lyra://x', true)
    const { service, reglages, E } = monter([])
    service.ecrire({ cle: 'a.com', regle: { zoom: 2 } }, E(priv))
    expect(reglages.getSettings().sites).toEqual({})
    service.ecrire({ cle: 'a.com', regle: { zoom: 2 } }, E(vue('lyra://x')))
    service.supprimer('a.com', E(priv))
    expect(reglages.getSettings().sites['a.com']).toEqual({ zoom: 2 })
  })
  it('écrit sous la clé canonique ; null retire un champ ; le zoom résolu revient au défaut après suppression', () => {
    const { service, reglages, E } = monter([])
    const v = E(vue('lyra://x'))
    service.ecrire({ cle: 'A.com', regle: { zoom: 2, cookies: 'bloques' } }, v)
    expect(Object.keys(reglages.getSettings().sites)).toEqual(['a.com'])
    service.ecrire({ cle: 'a.com', regle: { zoom: null } }, v)
    expect(reglages.getSettings().sites['a.com']).toEqual({ cookies: 'bloques' })
    service.ecrire({ cle: 'a.com', regle: { zoom: 1.5 } }, v)
    expect(resoudre(reglages.getSettings().sites, 'https://a.com').zoom).toBe(1.5)
    service.supprimer('A.com', v)
    expect(resoudre(reglages.getSettings().sites, 'https://a.com').zoom).toBeUndefined()
  })
  it('sites:changed va aux vues internes seulement, sans settings:changed quand seules les règles changent', () => {
    const interne = vue('file:///app/renderer/ui.html#chrome')
    const lyra = vue('lyra://reglages')
    const web = vue('https://evil.test/')
    const { service, reglages, E } = monter([interne, lyra, web])
    let avant = reglages.getSettings()
    let diffusions = 0
    reglages.onChanged((s) => {
      if (reglagesHorsSitesChanges(avant, s)) diffusions++
      avant = s
    })
    service.ecrire({ cle: 'a.com', regle: { style: 'body{}' } }, E(vue('lyra://x')))
    expect(diffusions).toBe(0)
    expect(interne.recus).toHaveLength(1)
    expect(lyra.recus).toHaveLength(1)
    expect(web.recus).toHaveLength(0)
    reglages.setSettings({ theme: 'sombre' })
    expect(diffusions).toBe(1)
    expect(interne.recus).toHaveLength(1)
  })
  it('estVueInterne : préfixe exact du renderer, jamais une adresse qui contient ui.html', () => {
    const dev: OriginesUI = { dev: 'http://localhost:5173', prod: ORIGINES.prod }
    expect(estVueInterne('lyra://reglages', ORIGINES)).toBe(true)
    expect(estVueInterne('file:///app/renderer/ui.html#chrome', ORIGINES)).toBe(true)
    expect(estVueInterne('http://localhost:5173/ui.html', dev)).toBe(true)
    for (const u of ['https://a.com/ui.html', 'file:///tmp/ui.html', 'file:///app/renderer-evil/ui.html', 'https://a.com/?x=lyra://', 'http://localhost:5173.evil.test/ui.html'])
      expect(estVueInterne(u, dev), u).toBe(false)
    expect(estVueInterne('file:///tmp/ui.html', ORIGINES)).toBe(false)
  })
})
