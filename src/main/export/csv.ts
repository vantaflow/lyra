/**
 * Historique en CSV « date, titre, adresse, visites » (une ligne par page : dernière visite et nombre de visites).
 * Pur : l'écriture se fait par lots (l'appelant laisse respirer le processus entre deux lots), la lecture est un
 * flux qui n'a jamais tout le fichier en mémoire.
 */
import type { Visite } from '../import/types'

export const ENTETE_CSV = 'date,titre,adresse,visites'
export const TAILLE_LOT_CSV = 5000

const champ = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

export const ligneCsv = (v: Visite): string => `${new Date(v.date).toISOString()},${champ(v.titre)},${champ(v.url)},${v.visites}`

function versVisite(c: string[]): Visite | null {
  if (c.length < 3) return null
  const date = Date.parse(c[0])
  const url = c[2].trim()
  if (!Number.isFinite(date) || !url) return null
  const n = Number(c[3])
  return { url, titre: c[1], date, visites: Number.isInteger(n) && n >= 1 ? n : 1 }
}

/** Lit un flux de morceaux de texte (découpage quelconque) et rend des lots de visites ; l'en-tête et les lignes invalides sont ignorés. */
export async function* lotsDepuisCsv(source: AsyncIterable<string>): AsyncGenerator<Visite[]> {
  let lot: Visite[] = []
  let champs: string[] = []
  let courant = ''
  let guillemets = false
  /** Un guillemet vient d'être lu dans un champ entre guillemets : fin du champ ou début d'un « "" ». */
  let guillemetVu = false
  let debut = true
  let premiere = true

  const finLigne = (): void => {
    champs.push(courant)
    courant = ''
    const c = champs
    champs = []
    if (premiere) {
      premiere = false
      if (c[0]?.trim().toLowerCase() === 'date') return
    }
    if (c.length === 1 && c[0] === '') return
    const v = versVisite(c)
    if (v) lot.push(v)
  }

  for await (const morceau of source) {
    let texte = morceau
    if (debut && texte.length > 0) {
      debut = false
      if (texte.charCodeAt(0) === 0xfeff) texte = texte.slice(1)
    }
    for (let i = 0; i < texte.length; i++) {
      const ch = texte[i]
      if (guillemetVu) {
        guillemetVu = false
        if (ch === '"') {
          courant += '"'
          continue
        }
        guillemets = false
      }
      if (guillemets) {
        if (ch === '"') guillemetVu = true
        else courant += ch
      } else if (ch === '"' && courant === '') guillemets = true
      else if (ch === ',') {
        champs.push(courant)
        courant = ''
      } else if (ch === '\n') finLigne()
      else if (ch !== '\r') courant += ch
    }
    while (lot.length >= TAILLE_LOT_CSV) yield lot.splice(0, TAILLE_LOT_CSV)
  }
  if (courant !== '' || champs.length > 0) finLigne()
  if (lot.length > 0) yield lot
}
