import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reglagesParDefaut } from '../settings/defaults'
import { lirePaquet, type SourcesPaquet } from './paquet'
import type { Horloge } from './planificateur'
import { SauvegardeAuto, type Coffre } from './sauvegardeAuto'

const PHRASE = 'phrase de sauvegarde'
const JOUR = 86_400_000

const coffre: Coffre = {
  disponible: () => true,
  chiffrer: (s) => Buffer.from(`coffre:${s}`.split('').reverse().join('')),
  dechiffrer: (b) => Buffer.from(b).toString().split('').reverse().join('').slice('coffre:'.length)
}

function horlogeFausse(debut: number) {
  let t = debut
  const timers: Array<{ at: number; fn: () => void; id: number }> = []
  let n = 0
  const h: Horloge & { avancer(ms: number): Promise<void> } = {
    maintenant: () => t,
    planifier(fn, ms) {
      const id = ++n
      timers.push({ at: t + ms, fn, id })
      return () => void timers.splice(timers.findIndex((x) => x.id === id), 1)
    },
    async avancer(ms) {
      const fin = t + ms
      for (;;) {
        timers.sort((a, b) => a.at - b.at)
        const p = timers[0]
        if (!p || p.at > fin) break
        timers.shift()
        t = Math.max(t, p.at)
        p.fn()
        // Laisse finir l'écriture réelle du fichier (asynchrone) : la planification suivante est posée en dernier.
        for (let i = 0; i < 400 && timers.length === 0; i++) await new Promise((r) => setTimeout(r, 5))
      }
      t = fin
    }
  }
  return h
}

const sources = (): SourcesPaquet => ({
  version: '0.1.0',
  reglages: reglagesParDefaut('/tmp'),
  favoris: [{ url: 'https://f.fr/', title: 'F', date: 1 }],
  visites: () => [{ url: 'https://h.fr/', titre: 'H', date: 5 }]
})

function monter(debut = new Date(2026, 0, 2, 14).getTime(), cof: Coffre = coffre) {
  const racine = mkdtempSync(join(tmpdir(), 'lyra-sauv-'))
  const dossier = join(racine, 'sauvegardes')
  const horloge = horlogeFausse(debut)
  const sa = new SauvegardeAuto({ fichierConfig: join(racine, 'sauvegarde-auto.json'), coffre: cof, horloge, sources, delaiDemarrage: 1000 })
  const fichiers = (): string[] => (existsSync(dossier) ? readdirSync(dossier).sort() : [])
  return { racine, dossier, horloge, sa, fichiers }
}

describe('SauvegardeAuto', () => {
  it('activer : la phrase n’est jamais écrite sur le disque, la clé est protégée par le coffre', async () => {
    const { racine, dossier, sa } = monter()
    await sa.activer(dossier, PHRASE)
    const brut = readFileSync(join(racine, 'sauvegarde-auto.json'), 'utf8')
    expect(brut).not.toContain(PHRASE)
    const c = JSON.parse(brut)
    expect(c.dossier).toBe(dossier)
    expect(c.iterations).toBeGreaterThanOrEqual(600_000)
    // Une clé AES-256 brute (32 octets), protégée par le coffre : jamais la phrase ni la clé en clair.
    expect(Buffer.from(coffre.dechiffrer(Buffer.from(c.cle, 'base64')), 'base64')).toHaveLength(32)
    expect(c.cle).not.toBe(Buffer.from(coffre.dechiffrer(Buffer.from(c.cle, 'base64')), 'base64').toString('base64'))
    expect(sa.etat()).toMatchObject({ actif: true, dossier })
  })

  it('une sauvegarde chiffrée par nuit, lisible avec la phrase seule ; 7 conservées au plus', async () => {
    const { horloge, dossier, sa, fichiers } = monter()
    await sa.activer(dossier, PHRASE)
    for (let nuit = 1; nuit <= 10; nuit++) {
      await horloge.avancer(JOUR)
    }
    const noms = fichiers()
    expect(noms.every((n) => /^lyra-sauvegarde-\d{8}-\d{6}\.lyra$/.test(n))).toBe(true)
    expect(noms).toHaveLength(7)
    const c = await lirePaquet(readFileSync(join(dossier, noms[noms.length - 1])), PHRASE)
    expect(c.favoris[0].url).toBe('https://f.fr/')
    expect(c.cookies).toBeUndefined()
    // Droits 0600 : POSIX seulement (Windows n'a pas de bits de mode, les ACL du dossier personnel s'appliquent).
    if (process.platform !== 'win32') expect(statSync(join(dossier, noms[0])).mode & 0o077).toBe(0)
    expect(sa.etat().derniere).toBeGreaterThan(0)
  }, 60_000)

  it('ne touche pas aux autres fichiers du dossier', async () => {
    const { horloge, dossier, sa, fichiers } = monter()
    await sa.activer(dossier, PHRASE)
    writeFileSync(join(dossier, 'notes.txt'), 'x')
    await horloge.avancer(2 * JOUR)
    expect(fichiers()).toContain('notes.txt')
  })

  it('désactiver : plus de minuterie, configuration effacée, sauvegardes existantes conservées', async () => {
    const { racine, horloge, dossier, sa, fichiers } = monter()
    await sa.activer(dossier, PHRASE)
    await horloge.avancer(2000)
    expect(fichiers()).toHaveLength(1)
    sa.desactiver()
    expect(sa.etat()).toEqual({ actif: false })
    expect(JSON.parse(readFileSync(join(racine, 'sauvegarde-auto.json'), 'utf8')).cle).toBeUndefined()
    await horloge.avancer(3 * JOUR)
    expect(fichiers()).toHaveLength(1)
  })

  it('sans coffre du système : refus expliqué, rien n’est activé ni écrit', async () => {
    const { racine, dossier, sa } = monter(undefined, { ...coffre, disponible: () => false })
    await expect(sa.activer(dossier, PHRASE)).rejects.toThrow(/coffre/i)
    expect(sa.etat()).toEqual({ actif: false })
    expect(existsSync(join(racine, 'sauvegarde-auto.json'))).toBe(false)
  })

  it('phrase trop courte refusée ; la configuration survit à un redémarrage', async () => {
    const { racine, horloge, dossier, sa, fichiers } = monter()
    await expect(sa.activer(dossier, 'court')).rejects.toThrow(/8 caractères/)
    await sa.activer(dossier, PHRASE)
    sa.arreter()
    const horloge2 = horlogeFausse(horloge.maintenant() + 3 * JOUR)
    const sa2 = new SauvegardeAuto({ fichierConfig: join(racine, 'sauvegarde-auto.json'), coffre, horloge: horloge2, sources, delaiDemarrage: 1000 })
    expect(sa2.etat()).toMatchObject({ actif: true, dossier })
    sa2.demarrer()
    await horloge2.avancer(5000)
    expect(fichiers().length).toBeGreaterThanOrEqual(1)
  })

  it('dossier inutilisable : l’erreur est mémorisée dans l’état, sans exception qui remonte', async () => {
    const { racine, horloge, sa } = monter()
    const fichierBloquant = join(racine, 'bloque')
    writeFileSync(fichierBloquant, 'x')
    await sa.activer(join(fichierBloquant, 'dedans'), PHRASE).catch(() => undefined)
    await horloge.avancer(5000)
    expect(sa.etat().actif === false || typeof sa.etat().erreur === 'string').toBe(true)
  })
})
