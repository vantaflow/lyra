/**
 * Lecteur du profil Orion (Kagi, macOS) — BEST EFFORT. Orion est un navigateur WebKit qui ne documente pas son
 * format de profil ; on s'appuie sur ce qu'on observe et sur la parenté avec Safari :
 *   - profils : sous-dossiers de `~/Library/Application Support/Orion/Defaults/` (« Default » est le profil principal) ;
 *   - favoris : `favourites.plist`, lu avec le lecteur de Safari (plist binaire ou XML, mêmes clés `WebBookmarkType`,
 *     `Children`, `URLString`…) ; ce qui n'est pas rangé dans « BookmarksBar » / « BookmarksMenu » va dans « autres » ;
 *   - historique : `history` (ou `History.db`), base SQLite au schéma de Safari (`history_items`, `history_visits`) ;
 *   - onglets, moteurs, extensions, réglages : non lus (`Indisponible` avec la raison).
 * Un fichier absent ou d'un autre format donne `Indisponible { raison }`, jamais une exception.
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { lireProfilApple } from './safari'
import type { ConfigApple, OptionsLectureApple } from './safari'
import type { ResultatLecture } from './chromium'
import type { ProfilDetecte } from './types'

const CONFIG_ORION: ConfigApple = {
  nom: 'Orion',
  favoris: ['favourites.plist'],
  historique: ['history', 'History.db'],
  indisponibles: {
    onglets: "Orion : les onglets ouverts ne sont pas importés (le format de session d'Orion n'est pas documenté).",
    moteurs: "Orion : les moteurs de recherche ne sont pas importés (le format de leur réglage n'est pas documenté).",
    extensions: "Orion : les extensions ne sont pas importées (celles d'Orion ne se transposent pas dans Lyra).",
    reglages: "Orion : les réglages ne sont pas importés (le format des préférences d'Orion n'est pas documenté)."
  }
}

/** Lit le profil Orion (favoris, historique) ; voir `lireProfilApple`. */
export function lireProfilOrion(profil: ProfilDetecte, opts: OptionsLectureApple = {}): Promise<ResultatLecture> {
  return lireProfilApple(profil, opts, CONFIG_ORION)
}

/** Profils = sous-dossiers de `<racine>/Defaults/` ; `[]` si Orion n'est pas là. `Default`, s'il existe, passe en tête. */
export async function detecterProfilsOrion(racine: string): Promise<ProfilDetecte[]> {
  const defauts = join(racine, 'Defaults')
  let noms: string[]
  try {
    noms = (await readdir(defauts, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
  noms.sort((a, b) => Number(b.toLowerCase() === 'default') - Number(a.toLowerCase() === 'default') || a.localeCompare(b))
  return noms.map((nom, i) => ({ navigateur: 'orion', nom, chemin: join(defauts, nom), racine, parDefaut: i === 0 }))
}
