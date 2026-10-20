import { describe, expect, it } from 'vitest'
import type { Visite } from '../import/types'
import { ENTETE_CSV, ligneCsv, lotsDepuisCsv } from './csv'

const v = (url: string, titre: string, date: number, visites = 1): Visite => ({ url, titre, date, visites })

async function* morceaux(texte: string, taille: number): AsyncGenerator<string> {
  for (let i = 0; i < texte.length; i += taille) yield texte.slice(i, i + taille)
}
async function lire(texte: string, taille = 7): Promise<Visite[]> {
  const sortie: Visite[] = []
  for await (const lot of lotsDepuisCsv(morceaux(texte, taille))) sortie.push(...lot)
  return sortie
}

describe('CSV de l’historique', () => {
  it('en-tête date, titre, adresse, visites ; date ISO 8601', () => {
    expect(ENTETE_CSV).toBe('date,titre,adresse,visites')
    expect(ligneCsv(v('https://a.fr/', 'A', Date.UTC(2026, 0, 2, 3, 4, 5), 3))).toBe('2026-01-02T03:04:05.000Z,A,https://a.fr/,3')
  })

  it('échappe virgules, guillemets et retours à la ligne', () => {
    expect(ligneCsv(v('https://a.fr/?a=1,2', 'Dit "bonjour", puis\nsaute', 0))).toBe('1970-01-01T00:00:00.000Z,"Dit ""bonjour"", puis\nsaute","https://a.fr/?a=1,2",1')
  })

  it('aller-retour, quel que soit le découpage des morceaux (y compris au milieu d’un guillemet doublé)', async () => {
    const src = [v('https://a.fr/', 'Dit "bonjour", puis\nsaute', 1_700_000_000_000, 4), v('https://b.fr/', '', 1_700_000_100_000), v('https://c.fr/x?y=1,2', 'Café ☕ ""', 1_700_000_200_000, 2)]
    const csv = [ENTETE_CSV, ...src.map(ligneCsv)].join('\r\n') + '\r\n'
    for (const taille of [1, 2, 3, 5, 7, 1000]) expect(await lire(csv, taille)).toEqual(src)
  })

  it('accepte fins de ligne LF, BOM, dernière ligne sans saut de ligne', async () => {
    const csv = '﻿date,titre,adresse,visites\n2026-01-02T03:04:05.000Z,A,https://a.fr/,3'
    expect(await lire(csv, 1000)).toEqual([v('https://a.fr/', 'A', Date.UTC(2026, 0, 2, 3, 4, 5), 3)])
  })

  it('ignore les lignes invalides (date illisible, adresse vide, colonnes manquantes) et borne les visites', async () => {
    const csv = ['date,titre,adresse,visites', 'pas-une-date,A,https://a.fr/,1', '2026-01-02T00:00:00.000Z,B,,1', '2026-01-02T00:00:00.000Z,seul', '', '2026-01-02T00:00:00.000Z,C,https://c.fr/,-5', '2026-01-02T00:00:00.000Z,D,https://d.fr/,abc'].join('\n')
    const lu = await lire(csv)
    expect(lu.map((x) => [x.url, x.visites])).toEqual([['https://c.fr/', 1], ['https://d.fr/', 1]])
  })

  it('rend les lots de 5000 au plus', async () => {
    const lignes = [ENTETE_CSV]
    for (let i = 0; i < 12_000; i++) lignes.push(ligneCsv(v(`https://h${i}.fr/`, `t${i}`, 1_700_000_000_000 + i)))
    const tailles: number[] = []
    for await (const lot of lotsDepuisCsv(morceaux(lignes.join('\n'), 100_000))) tailles.push(lot.length)
    expect(tailles).toEqual([5000, 5000, 2000])
  })
})
