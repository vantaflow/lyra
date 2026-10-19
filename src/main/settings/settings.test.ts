import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerReglages } from './settings'

function creer() {
  const dossier = mkdtempSync(join(tmpdir(), 'lyra-settings-'))
  return creerReglages(join(dossier, 'settings.json'), '/tmp/dl')
}

describe('réglages', () => {
  it('valeurs par défaut de la spec', () => {
    const s = creer().getSettings()
    expect(s.version).toBe(1)
    expect(s.theme).toBe('systeme')
    expect(s.moteurParDefaut).toBe('duckduckgo')
    expect(s.moteurChoisi).toBe(false)
    expect(s.ciel).toEqual({ position: 'gauche', largeur: 272, masque: false, revelerAuSurvol: true, ternirApresMin: 30, endormirApresMin: 120 })
    expect(s.boucliers).toEqual({ niveau: 'standard', genes: false, majHeures: 6 })
    expect(s.telechargements).toEqual({ dossier: '/tmp/dl', demander: false })
  })

  it("setSettings({ theme: 'sombre' }) émet settings:changed", () => {
    const r = creer()
    const recus: string[] = []
    r.onChanged((s) => recus.push(s.theme))
    const s = r.setSettings({ theme: 'sombre' })
    expect(s.theme).toBe('sombre')
    expect(recus).toEqual(['sombre'])
    expect(r.getSettings().theme).toBe('sombre')
  })

  it('setSettings ignore un patch invalide', () => {
    const r = creer()
    const avant = r.getSettings()
    const s = r.setSettings({ theme: 42, version: 2, x: 1 } as never)
    expect(s).toEqual(avant)
  })

  it('supprimerPersonnelle retire la clé (fusion ne sait pas supprimer), persiste et notifie', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'lyra-settings-'))
    const chemin = join(dossier, 'settings.json')
    const r = creerReglages(chemin, '/tmp/dl')
    r.setSettings({ reseau: { personnelle: { type: 'socks5', hote: '127.0.0.1', port: 40000 } } } as never)
    expect(r.getSettings().reseau.personnelle).toEqual({ type: 'socks5', hote: '127.0.0.1', port: 40000 })
    // Un patch ne peut pas supprimer : null et undefined sont ignorés.
    r.setSettings({ reseau: { personnelle: null } } as never)
    expect(r.getSettings().reseau.personnelle).toBeDefined()
    const recus: unknown[] = []
    r.onChanged((s) => recus.push(s.reseau.personnelle))
    const s = r.supprimerPersonnelle()
    expect('personnelle' in s.reseau).toBe(false)
    expect(s.reseau.passerelles).toBe(true)
    expect(recus).toEqual([undefined])
    expect('personnelle' in creerReglages(chemin, '/tmp/dl').getSettings().reseau).toBe(false)
  })
})
