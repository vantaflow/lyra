import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerRacineTemp } from '../../tests/vitest/racine-temp'

// Les dossiers temporaires des tests (mkdtemp sous tmpdir()) ne doivent jamais s'accumuler sur le disque.
describe('racine temporaire des tests vitest', () => {
  it('chaque fichier de test écrit ses dossiers temporaires dans une racine dédiée', () => {
    const racine = process.env.LYRA_VITEST_RACINE
    expect(racine).toBeTruthy()
    expect(tmpdir()).toBe(racine)
  })

  it('nettoyer() efface la racine et son contenu, et rend les variables d’environnement d’origine', () => {
    const avant = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP }
    const r = creerRacineTemp()
    expect(tmpdir()).toBe(r.racine)
    const d = mkdtempSync(join(tmpdir(), 'lyra-essai-'))
    writeFileSync(join(d, 'f.txt'), 'x')
    r.nettoyer()
    expect(existsSync(r.racine)).toBe(false)
    expect({ TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP }).toEqual(avant)
  })
})
