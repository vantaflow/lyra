/**
 * Lecteur du profil Safari (macOS) : favoris (`Bookmarks.plist`, plist binaire) et historique (`History.db`, SQLite).
 * Onglets, moteurs, extensions et réglages ne sont pas lus (`Indisponible` avec la raison). Tout passe par une copie
 * du fichier (voir `copie.ts`) ; aucune exception ne remonte à l'appelant, aucun accès à Electron.
 *
 * Les fonctions communes (`lireProfilApple`, `favorisDepuisPlist`…) servent aussi à Orion (`orion.ts`), dont le
 * profil reprend le schéma de Safari.
 *
 * Accès complet au disque : sans lui, macOS refuse la lecture de `~/Library/Safari` (EPERM/EACCES) ; l'élément est
 * alors `Indisponible` avec le code `verrouille` et la marche à suivre.
 */
import { statSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { EPOQUE_APPLE_MS, UidPlist, lirePlist } from './bplist'
import type { ValeurPlist } from './bplist'
import type { OptionsLecture, ResultatLecture } from './chromium'
import { avecCopieur, codeErreurFichier, raisonErreurFichier } from './copie'
import type { Copieur, OptionsCopie } from './copie'
import { ouvrirBaseCopiee } from './sqlite'
import type { BaseLue } from './sqlite'
import { ELEMENTS_IMPORT, ErreurImport, JOURS_HISTORIQUE_PAR_DEFAUT, compter, indisponible } from './types'
import type { DonneesImportees, ElementImport, FavorisImportes, Indisponible, NoeudFavori, ProfilDetecte, Visite } from './types'

export type { OptionsLecture, ResultatLecture, Progression } from './chromium'

/** Mêmes options que Chromium et Firefox (`signal` vérifié entre deux éléments et entre deux lots d'historique). */
export type OptionsLectureApple = OptionsLecture

/** Ce qui change d'un navigateur à l'autre (Safari, Orion) : fichiers du profil et raisons des éléments non lus. */
export interface ConfigApple {
  /** Nom affiché (messages). */
  nom: string
  /** Fichiers de favoris possibles, relatifs au profil (le premier trouvé est lu). */
  favoris: readonly string[]
  /** Fichiers d'historique possibles (schéma Safari : `history_items`, `history_visits`). */
  historique: readonly string[]
  /** Raison affichée pour chaque élément non pris en charge. */
  indisponibles: Record<'onglets' | 'moteurs' | 'extensions' | 'reglages', string>
  /** Message quand macOS refuse la lecture (Accès complet au disque) ; sinon message générique. */
  accesRefuse?: string
}

export const MESSAGE_ACCES_COMPLET_SAFARI = 'Safari : autorisez Lyra dans Réglages Système → Confidentialité et sécurité → Accès complet au disque, puis réessayez.'

const CONFIG_SAFARI: ConfigApple = {
  nom: 'Safari',
  favoris: ['Bookmarks.plist'],
  historique: ['History.db'],
  indisponibles: {
    onglets: "Safari : les onglets ouverts ne sont pas importés (le format de session de Safari n'est pas pris en charge).",
    moteurs: 'Safari : le moteur de recherche est un réglage du système, sans mots-clés personnalisés à importer.',
    extensions: "Safari : les extensions viennent de l'App Store ou d'applications macOS, elles ne se transposent pas dans Lyra.",
    reglages: 'Safari : les réglages sont dans des préférences protégées par macOS, ils ne sont pas importés.'
  },
  accesRefuse: MESSAGE_ACCES_COMPLET_SAFARI
}

// ---------------------------------------------------------------------------------------------------------------------
// Utilitaires

const JOUR_MS = 86_400_000
const HTTP = /^https?:\/\//i
const LIEN_FAVORI = /^(https?|ftp|file):/i

/** Safari date en secondes depuis le 1er janvier 2001 UTC. */
export function appleVersMs(secondes: unknown): number {
  const n = Number(secondes)
  return Number.isFinite(n) && n > 0 ? Math.max(0, Math.round(EPOQUE_APPLE_MS + n * 1000)) : 0
}

export const msVersApple = (ms: number): number => (ms - EPOQUE_APPLE_MS) / 1000

const dict = (v: unknown): Record<string, ValeurPlist> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Uint8Array) && !(v instanceof UidPlist)
    ? (v as Record<string, ValeurPlist>)
    : undefined
const texte = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

const estDossier = (chemin: string): boolean => {
  try {
    return statSync(chemin).isDirectory()
  } catch (e) {
    return codeSysteme(e) === 'EPERM' || codeSysteme(e) === 'EACCES' // il existe, macOS en refuse seulement l'accès
  }
}

/** Code d'erreur du système (« EPERM »), sur l'erreur ou sur sa cause ; le `code` d'une `ErreurImport` n'en est pas un. */
function codeSysteme(e: unknown): string | undefined {
  const cause = (e as { cause?: unknown } | null)?.cause
  for (const candidat of [(e as { code?: unknown } | null)?.code, (cause as { code?: unknown } | null | undefined)?.code]) {
    if (typeof candidat === 'string' && /^E[A-Z0-9]+$/.test(candidat)) return candidat
  }
  return undefined
}

const estRefusAcces = (e: unknown): boolean => codeSysteme(e) === 'EPERM' || codeSysteme(e) === 'EACCES'

const annulation = (): ErreurImport => new ErreurImport('Lecture annulée.', { code: 'annule' })

function verifierAnnulation(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw annulation()
}

interface Contexte {
  profil: ProfilDetecte
  cfg: ConfigApple
  copieur: Copieur
  opts: OptionsLectureApple
}

function versIndisponible(e: unknown, c: Pick<Contexte, 'cfg'>): Indisponible {
  if (c.cfg.accesRefuse && estRefusAcces(e)) return indisponible(c.cfg.accesRefuse, 'verrouille')
  if (e instanceof ErreurImport) return indisponible(e.raison, e.code)
  return indisponible(`Lecture impossible : ${e instanceof Error ? e.message : String(e)}`)
}

async function proteger<T>(c: Contexte, fn: () => Promise<T>): Promise<T | Indisponible> {
  try {
    return await fn()
  } catch (e) {
    return versIndisponible(e, c)
  }
}

/** Chemin du premier fichier candidat qui existe ; `undefined` s'il n'y en a aucun. Un refus d'accès remonte. */
function trouverFichier(c: Contexte, noms: readonly string[]): string | undefined {
  for (const nom of noms) {
    const chemin = join(c.profil.chemin, nom)
    try {
      if (statSync(chemin).isFile()) return chemin
    } catch (e) {
      const code = codeSysteme(e)
      if (code === 'ENOENT' || code === 'ENOTDIR') continue
      throw new ErreurImport(raisonErreurFichier(e, nom, c.cfg.nom, c.opts.plateforme), { cause: e, code: codeErreurFichier(e) })
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------------------------------
// Favoris

const TYPE_LISTE = 'WebBookmarkTypeList'
const TYPE_LIEN = 'WebBookmarkTypeLeaf'
const LISTE_DE_LECTURE = 'com.apple.ReadingList'

function convertirNoeud(brut: ValeurPlist): NoeudFavori | undefined {
  const n = dict(brut)
  if (!n) return undefined
  if (n.WebBookmarkType === TYPE_LIEN) {
    const url = texte(n.URLString)
    if (!url || !LIEN_FAVORI.test(url)) return undefined // javascript:, about: … : pas des favoris transposables
    return { type: 'lien', titre: texte(dict(n.URIDictionary)?.title) ?? texte(n.Title) ?? url, url, date: 0 }
  }
  if (n.WebBookmarkType === TYPE_LISTE) {
    if (n.Title === LISTE_DE_LECTURE) return undefined // liste de lecture : pas des favoris
    return { type: 'dossier', titre: texte(n.Title) ?? '', date: 0, enfants: enfants(n.Children) }
  }
  return undefined // proxys (Historique), types inconnus
}

function enfants(brut: ValeurPlist | undefined): NoeudFavori[] {
  return Array.isArray(brut) ? brut.flatMap((b) => convertirNoeud(b) ?? []) : []
}

/**
 * Favoris depuis la racine d'un `Bookmarks.plist` : « BookmarksBar » → barre, « BookmarksMenu » → autres, la liste de
 * lecture est ignorée ; tout autre dossier ou lien de premier niveau est rangé dans « autres » (Orion, Safari récent).
 */
export function favorisDepuisPlist(racine: ValeurPlist): FavorisImportes {
  const r = dict(racine)
  if (!r || !Array.isArray(r.Children)) throw new ErreurImport('Fichier de favoris au format inattendu.')
  const barre: NoeudFavori[] = []
  const autres: NoeudFavori[] = []
  for (const brut of r.Children) {
    const n = dict(brut)
    if (n?.WebBookmarkType === TYPE_LISTE && n.Title === 'BookmarksBar') barre.push(...enfants(n.Children))
    else if (n?.WebBookmarkType === TYPE_LISTE && n.Title === 'BookmarksMenu') autres.push(...enfants(n.Children))
    else {
      const noeud = convertirNoeud(brut)
      if (noeud) autres.push(noeud)
    }
  }
  return { barre, autres }
}

async function lireFavoris(c: Contexte): Promise<FavorisImportes> {
  const source = trouverFichier(c, c.cfg.favoris)
  if (!source) throw new ErreurImport(`Aucun fichier de favoris dans ce profil (${c.cfg.favoris[0]} introuvable).`, { code: 'absent' })
  const octets = await c.copieur.lire(source)
  return favorisDepuisPlist(lirePlist(octets))
}

// ---------------------------------------------------------------------------------------------------------------------
// Historique

/**
 * Historique par lots, du plus récent au plus ancien. Les visites sont comptées dans la fenêtre demandée (table
 * `history_visits`, `visit_time` en secondes depuis 2001) ; le titre est celui de la dernière visite. Seules les pages
 * http(s) sont retenues.
 */
async function lireHistorique(c: Contexte): Promise<Visite[]> {
  const source = trouverFichier(c, c.cfg.historique)
  if (!source) throw new ErreurImport('Aucun historique dans ce profil.', { code: 'absent' })
  const copies = await c.copieur.copier(source, { base: true, sujet: "L'historique" })
  let base: BaseLue
  try {
    base = await ouvrirBaseCopiee(copies)
  } finally {
    await c.copieur.liberer(copies) // le contenu est en mémoire : la copie sur disque n'a plus d'utilité
  }
  try {
    const tables = base.tables()
    if (!tables.includes('history_items') || !tables.includes('history_visits')) throw new ErreurImport("Historique d'un format inconnu (tables des pages ou des visites absentes).")
    const colonnes = base.colonnes('history_visits')
    if (!['history_item', 'visit_time', 'title'].every((k) => colonnes.includes(k))) throw new ErreurImport("Historique d'un format inconnu (colonnes des visites absentes).")

    const jours = c.opts.depuisJours === undefined ? JOURS_HISTORIQUE_PAR_DEFAUT : c.opts.depuisJours
    const maintenant = c.opts.maintenant ?? Date.now()
    const seuil = jours === null ? -1e15 : msVersApple(maintenant - jours * JOUR_MS)
    const sql = `SELECT i.url AS url, v.title AS titre, MAX(v.visit_time) AS dernier, COUNT(*) AS n
                 FROM history_visits v JOIN history_items i ON i.id = v.history_item
                 WHERE v.visit_time >= ?
                 GROUP BY i.id ORDER BY dernier DESC`

    const visites: Visite[] = []
    for await (const lignes of base.parLots(sql, [seuil], c.opts.tailleLot ?? 2000)) {
      verifierAnnulation(c.opts.signal)
      for (const l of lignes) {
        const url = String(l.url ?? '')
        if (!HTTP.test(url)) continue
        visites.push({ url, titre: String(l.titre ?? ''), date: appleVersMs(l.dernier), visites: Math.max(1, Math.trunc(Number(l.n)) || 1) })
      }
      c.opts.surProgression?.({ element: 'historique', fait: visites.length })
    }
    return visites
  } catch (e) {
    if (e instanceof ErreurImport) throw e
    throw new ErreurImport("L'historique est corrompu ou d'un format inattendu.", { cause: e })
  } finally {
    base.fermer()
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Point d'entrée commun (Safari, Orion)

/**
 * Lit les éléments demandés d'un profil au schéma Safari. Ne lève jamais : un profil absent ou un élément illisible
 * donne `Indisponible { raison }`. Les copies temporaires sont supprimées avant le retour, même en cas d'erreur.
 */
export async function lireProfilApple(profil: ProfilDetecte, opts: OptionsLectureApple, cfg: ConfigApple): Promise<ResultatLecture> {
  const elements: readonly ElementImport[] = opts.elements ?? ELEMENTS_IMPORT
  const donnees: DonneesImportees = {}
  const copie: OptionsCopie = {
    navigateur: cfg.nom,
    dossierTemp: opts.dossierTemp,
    plateforme: opts.plateforme,
    tailleMaxFichier: opts.tailleMaxFichier,
    tailleMaxBase: opts.tailleMaxBase
  }
  const marquer = (valeur: Indisponible): void => {
    for (const element of elements) if (donnees[element] === undefined) Object.assign(donnees, { [element]: valeur })
  }

  if (!estDossier(profil.chemin)) {
    marquer(indisponible(`Le profil « ${profil.nom} » est introuvable (dossier supprimé ou déplacé).`, 'absent'))
    return { donnees, compteurs: compter(donnees) }
  }

  try {
    await avecCopieur(async (copieur) => {
      const c: Contexte = { profil, cfg, copieur, opts }
      for (const element of elements) {
        if (opts.signal?.aborted) {
          Object.assign(donnees, { [element]: indisponible('Lecture annulée.', 'annule') })
          continue
        }
        opts.surProgression?.({ element, fait: 0 })
        switch (element) {
          case 'favoris':
            donnees.favoris = await proteger(c, () => lireFavoris(c))
            break
          case 'historique':
            donnees.historique = await proteger(c, () => lireHistorique(c))
            break
          case 'onglets':
          case 'moteurs':
          case 'extensions':
          case 'reglages':
            Object.assign(donnees, { [element]: indisponible(cfg.indisponibles[element]) })
            break
        }
      }
    }, copie)
  } catch (e) {
    // Dossier temporaire impossible à créer, par exemple : tout ce qui n'a pas été lu est indisponible.
    marquer(versIndisponible(e, { cfg }))
  }
  return { donnees, compteurs: compter(donnees) }
}

/** Lit le profil Safari (favoris, historique) ; voir `lireProfilApple`. */
export function lireProfilSafari(profil: ProfilDetecte, opts: OptionsLectureApple = {}): Promise<ResultatLecture> {
  return lireProfilApple(profil, opts, CONFIG_SAFARI)
}

/** Safari n'a qu'un profil : le dossier `~/Library/Safari` (`racine`), `[]` s'il n'existe pas. */
export async function detecterProfilsSafari(racine: string): Promise<ProfilDetecte[]> {
  try {
    if (!(await stat(racine)).isDirectory()) return []
  } catch (e) {
    if (!estRefusAcces(e)) return [] // absent : Safari n'est pas là (un refus d'accès prouve au contraire qu'il y est)
  }
  return [{ navigateur: 'safari', nom: 'Safari', chemin: racine, racine, parDefaut: true }]
}
