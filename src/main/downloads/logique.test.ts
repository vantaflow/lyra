import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DownloadInfo } from '../../shared/types'
import { ajouterFinal, nomUnique, reduire } from './logique'

const existe = (...chemins: string[]) => (c: string) => chemins.map((x) => join(x)).includes(join(c))

describe('nomUnique', () => {
  it('garde le nom libre', () => {
    expect(nomUnique('/d', 'fichier.txt', existe())).toBe('fichier.txt')
  })
  it('ajoute (2), (3)…', () => {
    expect(nomUnique('/d', 'fichier.txt', existe('/d/fichier.txt'))).toBe('fichier (2).txt')
    expect(nomUnique('/d', 'fichier.txt', existe('/d/fichier.txt', '/d/fichier (2).txt'))).toBe('fichier (3).txt')
  })
  it('gère les noms sans extension et à plusieurs points', () => {
    expect(nomUnique('/d', 'LISEZMOI', existe('/d/LISEZMOI'))).toBe('LISEZMOI (2)')
    expect(nomUnique('/d', 'a.tar.gz', existe('/d/a.tar.gz'))).toBe('a.tar (2).gz')
  })
  it('neutralise les séparateurs de chemin', () => {
    expect(nomUnique('/d', '../x/evil.txt', existe())).toBe('evil.txt')
  })
})

const base: DownloadInfo = { id: '1', nom: 'a.zip', chemin: '', url: 'https://e.fr/a.zip', total: 0, recu: 0, etat: 'en-cours', date: 0 }

describe('reduire', () => {
  it('updated en progression : octets, total, vitesse', () => {
    const r = reduire(base, { type: 'updated', recu: 1000, total: 4000, pause: false, interrompu: false, dtMs: 500 })
    expect(r).toMatchObject({ recu: 1000, total: 4000, etat: 'en-cours', vitesse: 2000 })
  })
  it('updated en pause', () => {
    const r = reduire({ ...base, vitesse: 5 }, { type: 'updated', recu: 10, total: 100, pause: true, interrompu: false, dtMs: 100 })
    expect(r.etat).toBe('pause')
    expect(r.vitesse).toBeUndefined()
  })
  it('updated interrompu : erreur', () => {
    expect(reduire(base, { type: 'updated', recu: 10, total: 100, pause: false, interrompu: true, dtMs: 100 }).etat).toBe('erreur')
  })
  it('done completed : terminé à 100 %', () => {
    const r = reduire({ ...base, recu: 3, total: 10, vitesse: 4 }, { type: 'done', resultat: 'completed', recu: 10, total: 10 })
    expect(r).toMatchObject({ etat: 'termine', recu: 10, total: 10 })
    expect(r.vitesse).toBeUndefined()
  })
  it('done cancelled / interrupted', () => {
    expect(reduire(base, { type: 'done', resultat: 'cancelled', recu: 1, total: 10 }).etat).toBe('annule')
    expect(reduire(base, { type: 'done', resultat: 'interrupted', recu: 1, total: 10 }).etat).toBe('erreur')
  })
  it('un état final n’est plus modifié par un updated tardif', () => {
    const fini = { ...base, etat: 'termine' as const, recu: 10, total: 10 }
    expect(reduire(fini, { type: 'updated', recu: 5, total: 10, pause: false, interrompu: false, dtMs: 1 })).toBe(fini)
  })
})

describe('ajouterFinal (persistance)', () => {
  const fin = (id: string, etat: DownloadInfo['etat']): DownloadInfo => ({ ...base, id, etat })
  it('garde les entrées terminées, annulées et en échec issues d’un done', () => {
    const annule = reduire({ ...base, id: 'a' }, { type: 'done', resultat: 'cancelled', recu: 1, total: 10 })
    const erreur = reduire({ ...base, id: 'b' }, { type: 'done', resultat: 'interrupted', recu: 1, total: 10 })
    const liste = ajouterFinal(ajouterFinal([], annule, 200), erreur, 200)
    expect(liste.map((i) => [i.id, i.etat])).toEqual([['b', 'erreur'], ['a', 'annule']])
  })
  it('ignore un état non final et respecte le plafond', () => {
    expect(ajouterFinal([], fin('x', 'en-cours'), 200)).toEqual([])
    const trois = ajouterFinal(ajouterFinal(ajouterFinal([], fin('1', 'termine'), 2), fin('2', 'erreur'), 2), fin('3', 'annule'), 2)
    expect(trois.map((i) => i.id)).toEqual(['3', '2'])
  })
})
