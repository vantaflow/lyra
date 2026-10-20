import { describe, expect, it } from 'vitest'
import { ERREUR_PHRASE } from '../../shared/exportTextes'
import { ITERATIONS_PBKDF2, TAILLE_ENTETE, chiffrer, chiffrerAvecCle, dechiffrer, deriverCle, exporterCle, importerCle, lireEnTete } from './chiffrement'

const clair = new TextEncoder().encode('{"secret":"données de test é€"}')
const PHRASE = 'correct horse battery'

describe('chiffrement du paquet', () => {
  it('aller-retour avec la bonne phrase, texte clair absent du fichier', async () => {
    const c = await chiffrer(clair, PHRASE)
    expect(Buffer.from(c).includes(Buffer.from('secret'))).toBe(false)
    expect(new TextDecoder().decode(await dechiffrer(c, PHRASE))).toBe('{"secret":"données de test é€"}')
  })

  it('en-tête : magie LYRA1, sel 16 octets, IV 12 octets, itérations ≥ 600 000 stockées', async () => {
    const c = await chiffrer(clair, PHRASE)
    expect(Buffer.from(c.subarray(0, 5)).toString('latin1')).toBe('LYRA1')
    const e = lireEnTete(c)
    expect(e.sel).toHaveLength(16)
    expect(e.iv).toHaveLength(12)
    expect(e.iterations).toBe(ITERATIONS_PBKDF2)
    expect(e.iterations).toBeGreaterThanOrEqual(600_000)
    expect(c.length).toBe(TAILLE_ENTETE + clair.length + 16)
  })

  it('sel et IV différents à chaque export', async () => {
    const a = lireEnTete(await chiffrer(clair, PHRASE))
    const b = lireEnTete(await chiffrer(clair, PHRASE))
    expect(Buffer.from(a.sel).equals(Buffer.from(b.sel))).toBe(false)
    expect(Buffer.from(a.iv).equals(Buffer.from(b.iv))).toBe(false)
  })

  it('mauvaise phrase : erreur claire', async () => {
    const c = await chiffrer(clair, PHRASE)
    await expect(dechiffrer(c, 'mauvaise phrase')).rejects.toThrow(ERREUR_PHRASE)
  })

  it('fichier tronqué, octet modifié (corps, sel, itérations), vide : même erreur', async () => {
    const c = await chiffrer(clair, PHRASE)
    await expect(dechiffrer(c.subarray(0, c.length - 1), PHRASE)).rejects.toThrow(ERREUR_PHRASE)
    await expect(dechiffrer(c.subarray(0, 20), PHRASE)).rejects.toThrow(ERREUR_PHRASE)
    for (const pos of [TAILLE_ENTETE + 3, 12, 8]) {
      const m = Uint8Array.from(c)
      m[pos] ^= 1
      await expect(dechiffrer(m, PHRASE)).rejects.toThrow(ERREUR_PHRASE)
    }
    await expect(dechiffrer(new Uint8Array(0), PHRASE)).rejects.toThrow()
  })

  it('refuse un fichier qui n’est pas un paquet Lyra, et des itérations hors bornes (sans lancer le calcul)', async () => {
    await expect(dechiffrer(new TextEncoder().encode('PK\u0003\u0004 pas un paquet, assez long pour passer la taille minimale xxxxxxxxxxxxxxx'), PHRASE)).rejects.toThrow(/paquet Lyra/)
    const c = Uint8Array.from(await chiffrer(clair, PHRASE))
    new DataView(c.buffer).setUint32(5, 1000, false)
    await expect(dechiffrer(c, PHRASE)).rejects.toThrow(ERREUR_PHRASE)
    new DataView(c.buffer).setUint32(5, 4_000_000_000, false)
    await expect(dechiffrer(c, PHRASE)).rejects.toThrow(ERREUR_PHRASE)
  })

  it('phrase trop courte refusée à l’export', async () => {
    await expect(chiffrer(clair, 'court')).rejects.toThrow(/8 caractères/)
    await expect(chiffrer(clair, '')).rejects.toThrow(/8 caractères/)
  })

  it('clé dérivée réutilisable (sauvegarde automatique) : se déchiffre avec la phrase seule', async () => {
    const k = await deriverCle(PHRASE, undefined, undefined, true)
    const brut = await exporterCle(k)
    expect(brut).toHaveLength(32)
    const k2 = await importerCle(brut, k.sel, k.iterations)
    const a = await chiffrerAvecCle(clair, k2)
    const b = await chiffrerAvecCle(clair, k2)
    expect(Buffer.from(lireEnTete(a).iv).equals(Buffer.from(lireEnTete(b).iv))).toBe(false)
    expect(new TextDecoder().decode(await dechiffrer(a, PHRASE))).toContain('secret')
    expect(new TextDecoder().decode(await dechiffrer(b, PHRASE))).toContain('secret')
  })
})
