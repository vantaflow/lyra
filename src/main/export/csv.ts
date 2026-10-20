/**
 * Historique en CSV « date, titre, adresse, visites » (une ligne par page : dernière visite et nombre de visites).
 * Pur : l'écriture se fait par lots (l'appelant laisse respirer le processus entre deux lots), la lecture est un
 * flux qui n'a jamais tout le fichier en mémoire.
 */
import type { Visite } from '../import/types'

export const ENTETE_CSV = 'date,titre,adresse,visites'
export const TAILLE_LOT_CSV = 5000

/** Un champ qui commence par l'un de ces caractères serait exécuté comme une formule par un tableur. */
const DECLENCHEUR = /^[=+\-@\t\r]/
/** Le `'` protecteur retiré à la lecture : seulement devant un déclencheur (l'aller-retour reste exact). */
const PROTEGE = /^'+[=+\-@\t\r]/
/** Un champ plus long est une ligne corrompue (ex. guillemet jamais refermé) : elle est ignorée. */
export const TAILLE_CHAMP_MAX = 64 * 1024

const champ = (s: string): string => {
  // Un texte qui commence déjà par « ' » + déclencheur est préfixé aussi, pour que la lecture ne le confonde pas avec une protection.
  const sur = DECLENCHEUR.test(s) || PROTEGE.test(s) ? `'${s}` : s
  return /[",\r\n]/.test(sur) ? `"${sur.replace(/"/g, '""')}"` : sur
}
const nettoyer = (s: string): string => (PROTEGE.test(s) ? s.slice(1) : s)

export const ligneCsv = (v: Visite): string => `${new Date(v.date).toISOString()},${champ(v.titre)},${champ(v.url)},${v.visites}`

function versVisite(c: string[]): Visite | null {
  if (c.length < 3) return null
  const date = Date.parse(c[0])
  const url = nettoyer(c[2]).trim()
  if (!Number.isFinite(date) || !url) return null
  const n = Number(c[3])
  return { url, titre: nettoyer(c[1]), date, visites: Number.isInteger(n) && n >= 1 ? n : 1 }
}

/** Lit un flux de morceaux de texte (découpage quelconque) et rend des lots de visites ; l'en-tête et les lignes invalides sont ignorés. */
export async function* lotsDepuisCsv(source: AsyncIterable<string>, surIgnoree?: () => void): AsyncGenerator<Visite[]> {
  let lot: Visite[] = []
  let champs: string[] = []
  let courant = ''
  let guillemets = false
  /** Un guillemet vient d'être lu dans un champ entre guillemets : fin du champ ou début d'un « "" ». */
  let guillemetVu = false
  let debut = true
  let premiere = true
  /** Ligne trop longue : tout est ignoré jusqu'à la fin de ligne suivante. */
  let saut = false

  const finLigne = (): void => {
    if (saut) {
      saut = false
      guillemets = false
      guillemetVu = false
      courant = ''
      champs = []
      return
    }
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
      if (saut) {
        if (ch === '\n') finLigne()
        continue
      }
      if (courant.length > TAILLE_CHAMP_MAX) {
        saut = true
        courant = ''
        champs = []
        surIgnoree?.()
        i--
        continue
      }
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
