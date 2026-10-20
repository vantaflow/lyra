import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerReglages } from './settings'
import { accueilImporteConsomme, installerAccueilImporte } from './accueil-importe'
import { reglagesParDefaut } from './defaults'

const base = reglagesParDefaut('/dl')
const avec = (accueil: string, enAttente?: string) => ({
  ...base,
  demarrage: { ...base.demarrage, pageAccueil: accueil },
  import: { ...base.import, reglagesEnAttente: enAttente === undefined ? {} : { pageAccueil: enAttente } }
})

describe('accueilImporteConsomme', () => {
  it('rien en attente : rien à faire', () => {
    expect(accueilImporteConsomme(avec(''))).toBeNull()
    expect(accueilImporteConsomme(avec('https://a.fr'))).toBeNull()
  })
  it('page d’accueil vide : copie la valeur puis vide l’entrée en attente', () => {
    const r = accueilImporteConsomme(avec('', 'https://chrome.exemple.fr/'))!
    expect(r.demarrage.pageAccueil).toBe('https://chrome.exemple.fr/')
    expect(r.import.reglagesEnAttente).toEqual({})
    expect('pageAccueil' in r.import.reglagesEnAttente).toBe(false)
  })
  it('conserve le reste de la file d’import et des réglages', () => {
    const s = avec('', 'https://chrome.exemple.fr/')
    s.import.extensionsEnAttente = [{ id: 'a'.repeat(32), nom: 'X', magasin: 'chrome' } as never]
    const r = accueilImporteConsomme(s)!
    expect(r.import.extensionsEnAttente).toEqual(s.import.extensionsEnAttente)
    expect(r.demarrage.restaurer).toBe(s.demarrage.restaurer)
    expect(r.moteursPerso).toBe(s.moteursPerso)
  })
  it('valeur existante jamais écrasée : l’entrée en attente est abandonnée', () => {
    const r = accueilImporteConsomme(avec('https://choisie.fr', 'https://chrome.exemple.fr/'))!
    expect(r.demarrage.pageAccueil).toBe('https://choisie.fr')
    expect(r.import.reglagesEnAttente).toEqual({})
  })
  it('une adresse qui n’est pas http(s) n’est jamais copiée (mais l’entrée est vidée)', () => {
    for (const mauvaise of ['javascript:alert(1)', 'file:///etc/passwd', 'lyra://settings', 'chrome://newtab', 'https://a b']) {
      const r = accueilImporteConsomme(avec('', mauvaise))!
      expect(r.demarrage.pageAccueil, mauvaise).toBe('')
      expect(r.import.reglagesEnAttente, mauvaise).toEqual({})
    }
  })
  it('un espace de saisie dans la page d’accueil existante compte comme vide', () => {
    expect(accueilImporteConsomme(avec('  ', 'https://chrome.exemple.fr/'))!.demarrage.pageAccueil).toBe('https://chrome.exemple.fr/')
  })
})

function creer() {
  const dossier = mkdtempSync(join(tmpdir(), 'lyra-accueil-'))
  const chemin = join(dossier, 'settings.json')
  return { chemin, reglages: creerReglages(chemin, '/tmp/dl') }
}

describe('installerAccueilImporte', () => {
  it('au démarrage : consomme une seule fois et persiste', () => {
    const { chemin, reglages } = creer()
    reglages.setSettings({ import: { reglagesEnAttente: { pageAccueil: 'https://chrome.exemple.fr/' } } } as never)
    installerAccueilImporte(reglages)
    expect(reglages.getSettings().demarrage.pageAccueil).toBe('https://chrome.exemple.fr/')
    expect(reglages.getSettings().import.reglagesEnAttente).toEqual({})
    // Rechargé depuis le disque : l’entrée n’y est plus (pas de seconde application).
    const relu = creerReglages(chemin, '/tmp/dl').getSettings()
    expect(relu.demarrage.pageAccueil).toBe('https://chrome.exemple.fr/')
    expect(relu.import.reglagesEnAttente).toEqual({})
  })
  it('l’utilisateur vide ensuite sa page d’accueil : elle ne revient pas', () => {
    const { reglages } = creer()
    reglages.setSettings({ import: { reglagesEnAttente: { pageAccueil: 'https://chrome.exemple.fr/' } } } as never)
    installerAccueilImporte(reglages)
    reglages.setSettings({ demarrage: { pageAccueil: '' } } as never)
    expect(reglages.getSettings().demarrage.pageAccueil).toBe('')
  })
  it('pendant l’exécution : un import qui dépose une page d’accueil la rend disponible aussitôt', () => {
    const { reglages } = creer()
    installerAccueilImporte(reglages)
    const recus: string[] = []
    reglages.onChanged((s) => recus.push(s.demarrage.pageAccueil))
    reglages.setSettings({ import: { reglagesEnAttente: { pageAccueil: 'https://safari.exemple.fr/' } } } as never)
    expect(reglages.getSettings().demarrage.pageAccueil).toBe('https://safari.exemple.fr/')
    expect(reglages.getSettings().import.reglagesEnAttente).toEqual({})
    expect(recus.at(-1)).toBe('https://safari.exemple.fr/')
  })
  it('pendant l’exécution : une page d’accueil existante n’est pas écrasée par un import', () => {
    const { reglages } = creer()
    reglages.setSettings({ demarrage: { pageAccueil: 'https://choisie.fr' } } as never)
    installerAccueilImporte(reglages)
    reglages.setSettings({ import: { reglagesEnAttente: { pageAccueil: 'https://safari.exemple.fr/' } } } as never)
    expect(reglages.getSettings().demarrage.pageAccueil).toBe('https://choisie.fr')
    expect(reglages.getSettings().import.reglagesEnAttente).toEqual({})
  })
  it('le désabonnement arrête l’écoute', () => {
    const { reglages } = creer()
    const stop = installerAccueilImporte(reglages)
    stop()
    reglages.setSettings({ import: { reglagesEnAttente: { pageAccueil: 'https://x.fr/' } } } as never)
    expect(reglages.getSettings().demarrage.pageAccueil).toBe('')
  })
})
