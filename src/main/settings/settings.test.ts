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
    expect(s.ciel).toEqual({ position: 'gauche', largeur: 272, masque: false, ternirApresMin: 30, endormirApresMin: 120 })
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
})
