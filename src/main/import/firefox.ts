/**
 * Lecteur des profils Firefox : détection (`profiles.ini`), favoris et historique (`places.sqlite`), onglets ouverts
 * et groupes (`sessionstore.jsonlz4` ou `sessionstore-backups/recovery.jsonlz4`, mozlz4), moteurs et mots-clés
 * (`search.json.mozlz4`), extensions (`extensions.json`), réglages transposables (`prefs.js`, zoom par site dans
 * `content-prefs.sqlite`). Même contrat que `chromium.ts` : tout passe par une copie (`copie.ts`), chaque élément
 * illisible devient `Indisponible { raison }`, aucune exception ne remonte, aucun accès à Electron (prêt pour un
 * `utilityProcess`), `opts.signal` vérifié entre deux éléments.
 *
 * Dates Firefox : microsecondes depuis 1970 (`PRTime`).
 */
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { avecCopieur } from './copie'
import type { Copieur, OptionsCopie } from './copie'
import type { OptionsLecture, ResultatLecture } from './chromium'
import { lireJsonMozlz4 } from './mozlz4'
import { ouvrirBaseCopiee } from './sqlite'
import type { BaseLue, Ligne } from './sqlite'
import { ELEMENTS_IMPORT, ErreurImport, JOURS_HISTORIQUE_PAR_DEFAUT, NOMS_NAVIGATEURS, compter, indisponible } from './types'
import type {
  CouleurGroupe,
  DonneesImportees,
  ExtensionImportee,
  FavorisImportes,
  FenetreImportee,
  GroupeImporte,
  Indisponible,
  Moteur,
  NoeudFavori,
  OngletImporte,
  OngletsImportes,
  ProfilDetecte,
  ReglagesImportes,
  Visite
} from './types'

const JOUR_MS = 86_400_000
const HTTP = /^https?:\/\//i
const LIEN_FAVORI = /^(https?|ftp|file):/i

export const firefoxVersMs = (microsecondes: unknown): number => {
  const n = Number(microsecondes)
  return Number.isFinite(n) && n > 0 ? Math.round(n / 1000) : 0
}
export const msVersFirefox = (ms: number): number => ms * 1000

const objet = (v: unknown): Record<string, unknown> | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)
const texte = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const estFichier = (chemin: string): boolean => {
  try {
    return statSync(chemin).isFile()
  } catch {
    return false
  }
}
const estDossier = (chemin: string): boolean => {
  try {
    return statSync(chemin).isDirectory()
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Détection : profiles.ini

/** Dossier de Firefox (celui de `profiles.ini`) selon la plateforme. */
export function racineFirefoxParDefaut(plateforme: NodeJS.Platform, env: NodeJS.ProcessEnv, maison: string): string {
  if (plateforme === 'win32') return join(env.APPDATA ?? join(maison, 'AppData', 'Roaming'), 'Mozilla', 'Firefox')
  if (plateforme === 'darwin') return join(maison, 'Library', 'Application Support', 'Firefox')
  return join(maison, '.mozilla', 'firefox')
}

/** Sections d'un fichier `.ini` (clés en minuscules). */
export function lireIni(contenu: string): Array<{ nom: string; cles: Record<string, string> }> {
  const sections: Array<{ nom: string; cles: Record<string, string> }> = []
  let courante: { nom: string; cles: Record<string, string> } | undefined
  for (const brute of contenu.replace(/^﻿/, '').split(/\r?\n/)) {
    const ligne = brute.trim()
    if (!ligne || ligne.startsWith(';') || ligne.startsWith('#')) continue
    const section = /^\[(.+)\]$/.exec(ligne)
    if (section) {
      courante = { nom: section[1].trim(), cles: {} }
      sections.push(courante)
      continue
    }
    const egal = ligne.indexOf('=')
    if (egal > 0 && courante) courante.cles[ligne.slice(0, egal).trim().toLowerCase()] = ligne.slice(egal + 1).trim()
  }
  return sections
}

/**
 * Verrou de profil : `parent.lock` (Windows) ou `.parentlock` (macOS, Linux).
 *
 * Limite connue : sur Windows, `parent.lock` est supprimé à la fermeture de Firefox ; sur macOS et Linux, `.parentlock`
 * peut subsister après la fermeture (l'indicateur fiable y serait le lien symbolique `lock`, absent à l'arrêt ; non
 * vérifié ici). `ouvert` peut donc y être vrai à tort : c'est un simple indicateur d'affichage, la lecture se fait de
 * toute façon sur une copie des fichiers.
 */
const firefoxOuvert = (chemin: string): boolean => existsSync(join(chemin, 'parent.lock')) || existsSync(join(chemin, '.parentlock'))

/** Profils déclarés dans `profiles.ini` ; liste vide si Firefox n'est pas installé. Ne lève jamais. */
export async function detecterProfilsFirefox(racine: string, navigateur: ProfilDetecte['navigateur'] = 'firefox'): Promise<ProfilDetecte[]> {
  const ini = join(racine, 'profiles.ini')
  if (!estFichier(ini)) return []
  let sections: ReturnType<typeof lireIni>
  try {
    sections = lireIni(await readFile(ini, 'utf8'))
  } catch {
    return []
  }
  const chemins = (s: { cles: Record<string, string> }, cle: string): string | undefined => {
    const brut = s.cles[cle]
    if (!brut) return undefined
    const relatif = s.cles.isrelative === undefined ? !isAbsolute(brut) : s.cles.isrelative !== '0'
    const chemin = resolve(relatif ? join(racine, brut) : brut)
    return chemin
  }
  const parInstall = sections.filter((s) => /^Install/i.test(s.nom)).map((s) => chemins(s, 'default')).find((c) => c && estDossier(c))
  const profils = sections
    .filter((s) => /^Profile\d+$/i.test(s.nom))
    .map((s) => ({ nom: s.cles.name ?? s.nom, chemin: chemins(s, 'path'), defaut: s.cles.default === '1' }))
    .filter((p): p is { nom: string; chemin: string; defaut: boolean } => !!p.chemin && estDossier(p.chemin))
  if (profils.length === 0) return []
  const defaut = parInstall ?? profils.find((p) => p.defaut)?.chemin ?? profils[0].chemin
  return profils
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }))
    .map((p) => ({ navigateur, nom: p.nom, chemin: p.chemin, racine, parDefaut: p.chemin === defaut, ouvert: firefoxOuvert(p.chemin) }))
}

// ---------------------------------------------------------------------------------------------------------------------
// Contexte de lecture

interface Contexte {
  profil: ProfilDetecte
  copieur: Copieur
  opts: OptionsLecture
  prefs?: Map<string, unknown>
}

async function ouvrirBaseDuProfil(c: Contexte, nom: string, sujet: string): Promise<BaseLue> {
  const source = join(c.profil.chemin, nom)
  if (!estFichier(source)) throw new ErreurImport(`${sujet[0]?.toUpperCase()}${sujet.slice(1)} est introuvable dans ce profil (${nom} absent).`)
  const copies = await c.copieur.copier(source, { base: true, sujet })
  try {
    return await ouvrirBaseCopiee(copies)
  } finally {
    await c.copieur.liberer(copies) // le contenu est en mémoire
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Favoris et historique : places.sqlite

interface LigneFavori {
  id: number
  type: number
  parent: number
  titre: string
  url?: string
  date: number
}

function construireArbre(lignes: LigneFavori[], racine: number, profondeur = 0): NoeudFavori[] {
  if (profondeur > 100) return []
  const noeuds: NoeudFavori[] = []
  for (const l of lignes.filter((x) => x.parent === racine)) {
    if (l.type === 2) noeuds.push({ type: 'dossier', titre: l.titre, date: l.date, enfants: construireArbre(lignes, l.id, profondeur + 1) })
    else if (l.type === 1 && l.url && LIEN_FAVORI.test(l.url)) noeuds.push({ type: 'lien', titre: l.titre || l.url, url: l.url, date: l.date })
    // type 3 (séparateur), `place:` (requêtes dynamiques), javascript: … : ignorés
  }
  return noeuds
}

async function lireFavoris(c: Contexte): Promise<FavorisImportes> {
  const base = await ouvrirBaseDuProfil(c, 'places.sqlite', 'la base des favoris et de l’historique')
  try {
    if (!base.tables().includes('moz_bookmarks')) throw new ErreurImport('Base des favoris au format inconnu (table moz_bookmarks absente).')
    const lignes: LigneFavori[] = base
      .lignes('SELECT b.id, b.type, b.parent, b.position, b.title, b.dateAdded, b.guid, p.url FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk ORDER BY b.parent, b.position, b.id')
      .map((l) => ({ id: Number(l.id), type: Number(l.type), parent: Number(l.parent), titre: String(l.title ?? ''), url: l.url == null ? undefined : String(l.url), date: firefoxVersMs(l.dateAdded), guid: String(l.guid ?? '') }))
    const racines = Object.fromEntries(
      base.lignes("SELECT id, guid FROM moz_bookmarks WHERE guid IN ('toolbar_____', 'menu________', 'unfiled_____', 'mobile______')").map((l) => [String(l.guid), Number(l.id)])
    ) as Record<string, number | undefined>
    if (racines.toolbar_____ === undefined && racines.menu________ === undefined) throw new ErreurImport('Base des favoris au format inattendu (racines absentes).')
    const barre = racines.toolbar_____ === undefined ? [] : construireArbre(lignes, racines.toolbar_____)
    const autres = [
      ...(racines.menu________ === undefined ? [] : construireArbre(lignes, racines.menu________)),
      ...(racines.unfiled_____ === undefined ? [] : construireArbre(lignes, racines.unfiled_____))
    ]
    const mobiles = racines.mobile______ === undefined ? [] : construireArbre(lignes, racines.mobile______)
    if (mobiles.length) autres.push({ type: 'dossier', titre: 'Favoris mobiles', date: 0, enfants: mobiles })
    return { barre, autres }
  } catch (e) {
    if (e instanceof ErreurImport) throw e
    throw new ErreurImport('La base des favoris est corrompue ou d’un format inattendu.', { cause: e })
  } finally {
    base.fermer()
  }
}

interface ResumeHistorique {
  pages: number
  visites: number
}

/** Visites http(s) de la fenêtre demandée, sans les pages cachées ni les cadres, téléchargements et contenus incorporés. */
async function parcourirHistorique(c: Contexte, surLot: (lot: Visite[]) => void | Promise<void>): Promise<ResumeHistorique> {
  const base = await ouvrirBaseDuProfil(c, 'places.sqlite', 'l’historique')
  try {
    if (!base.tables().includes('moz_places')) throw new ErreurImport('Historique d’un format inconnu (table moz_places absente).')
    const jours = c.opts.depuisJours === undefined ? JOURS_HISTORIQUE_PAR_DEFAUT : c.opts.depuisJours
    const maintenant = c.opts.maintenant ?? Date.now()
    const seuil = jours === null ? 0 : msVersFirefox(maintenant - jours * JOUR_MS)
    const avecVisites = base.tables().includes('moz_historyvisits')
    const sql = avecVisites
      ? `SELECT p.url AS url, p.title AS titre, MAX(v.visit_date) AS dernier, COUNT(*) AS n
         FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
         WHERE v.visit_date >= ? AND p.hidden = 0 AND v.visit_type NOT IN (4, 7, 8)
         GROUP BY p.id ORDER BY dernier DESC`
      : `SELECT url, title AS titre, last_visit_date AS dernier, visit_count AS n
         FROM moz_places WHERE last_visit_date >= ? AND hidden = 0 AND visit_count > 0 ORDER BY last_visit_date DESC`
    const resume: ResumeHistorique = { pages: 0, visites: 0 }
    for await (const lignes of base.parLots(sql, [seuil], c.opts.tailleLot ?? 2000)) {
      if (c.opts.signal?.aborted) throw new ErreurImport('Lecture annulée.', { code: 'annule' })
      const lot: Visite[] = []
      for (const l of lignes) {
        const url = String(l.url ?? '')
        if (!HTTP.test(url)) continue
        const visites = Math.max(1, Math.trunc(Number(l.n)) || 1)
        lot.push({ url, titre: String(l.titre ?? ''), date: firefoxVersMs(l.dernier), visites })
        resume.visites += visites
      }
      resume.pages += lot.length
      if (lot.length) await surLot(lot)
      c.opts.surProgression?.({ element: 'historique', fait: resume.pages })
    }
    return resume
  } catch (e) {
    if (e instanceof ErreurImport) throw e
    throw new ErreurImport('L’historique est corrompu ou d’un format inattendu.', { cause: e })
  } finally {
    base.fermer()
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Onglets ouverts et groupes : session mozlz4

const COULEURS_FIREFOX: Record<string, CouleurGroupe> = { gray: 'gris', grey: 'gris', blue: 'bleu', red: 'rouge', yellow: 'jaune', green: 'vert', pink: 'rose', purple: 'violet', cyan: 'cyan', orange: 'orange' }

/** Fichier de session le plus pertinent : celui de la fermeture propre, sinon la sauvegarde courante, sinon la précédente. */
function fichierSession(profil: string): string | undefined {
  return ['sessionstore.jsonlz4', join('sessionstore-backups', 'recovery.jsonlz4'), join('sessionstore-backups', 'previous.jsonlz4')].map((f) => join(profil, f)).find(estFichier)
}

function convertirFenetre(brut: unknown): FenetreImportee | undefined {
  const f = objet(brut)
  if (!f || !Array.isArray(f.tabs)) return undefined
  const groupes: GroupeImporte[] = []
  for (const g of Array.isArray(f.groups) ? f.groups : []) {
    const o = objet(g)
    const id = texte(o?.id)
    if (!o || !id) continue
    groupes.push({ id, nom: texte(o.name) ?? '', couleur: COULEURS_FIREFOX[String(o.color ?? '').toLowerCase()] ?? 'gris' })
  }
  const ids = new Set(groupes.map((g) => g.id))
  const onglets: OngletImporte[] = []
  for (const t of f.tabs) {
    const o = objet(t)
    if (!o || !Array.isArray(o.entries) || o.entries.length === 0) continue
    const index = Math.min(Math.max(Math.trunc(Number(o.index) || o.entries.length), 1), o.entries.length) - 1
    const entree = objet(o.entries[index])
    const url = texte(entree?.url)
    if (!url || !HTTP.test(url)) continue // about:, moz-extension: … : rien à restaurer
    const groupe = texte(o.groupId)
    onglets.push({ url, titre: texte(entree?.title) ?? url, ...(groupe && ids.has(groupe) ? { groupe } : {}), ...(o.pinned === true ? { epingle: true } : {}) })
  }
  return onglets.length ? { onglets, groupes: groupes.filter((g) => onglets.some((o) => o.groupe === g.id)) } : undefined
}

async function lireOnglets(c: Contexte): Promise<OngletsImportes> {
  const source = fichierSession(c.profil.chemin)
  if (!source) throw new ErreurImport('Aucune session enregistrée dans ce profil.')
  const json = lireJsonMozlz4(await c.copieur.lire(source, { sujet: 'La session' }), 'la session', c.opts.tailleMaxFichier)
  const racine = objet(json)
  if (!racine || !Array.isArray(racine.windows)) throw new ErreurImport('Session au format inattendu.')
  const fenetres = racine.windows.flatMap((w) => convertirFenetre(w) ?? [])
  if (!fenetres.length) throw new ErreurImport('La session ne contient aucun onglet.', { code: 'vide' })
  return { fenetres }
}

// ---------------------------------------------------------------------------------------------------------------------
// Moteurs de recherche et mots-clés : search.json.mozlz4

/** Modèle Firefox (`{searchTerms}` dans le modèle ou dans les `params`) → modèle Lyra avec `%s` ; `undefined` sinon. */
export function convertirModeleFirefox(modele: string, params: unknown): string | undefined {
  let u = modele.trim()
  const parametres = (Array.isArray(params) ? params : [])
    .map((p) => objet(p))
    .filter((p): p is Record<string, unknown> => !!p && typeof p.name === 'string' && typeof p.value === 'string')
    .map((p) => `${encodeURIComponent(String(p.name))}=${String(p.value)}`)
  if (parametres.length) u += (u.includes('?') ? '&' : '?') + parametres.join('&')
  if (!u.includes('{searchTerms}')) return undefined
  u = u.replace(/\{searchTerms\}/g, '%s').replace(/\{inputEncoding\}/g, 'UTF-8').replace(/\{[^}]*\}/g, '')
  return HTTP.test(u) && u.includes('%s') ? u : undefined
}

async function lireMoteurs(c: Contexte): Promise<Moteur[]> {
  const source = join(c.profil.chemin, 'search.json.mozlz4')
  if (!estFichier(source)) throw new ErreurImport('Aucun fichier de moteurs de recherche dans ce profil.')
  const json = objet(lireJsonMozlz4(await c.copieur.lire(source, { sujet: 'La liste des moteurs' }), 'la liste des moteurs', c.opts.tailleMaxFichier))
  if (!json || !Array.isArray(json.engines)) throw new ErreurImport('Liste des moteurs au format inattendu.')
  const meta = objet(json.metaData)
  const idDefaut = texte(meta?.defaultEngineId) ?? texte(meta?.current)
  const moteurs: Moteur[] = []
  const vus = new Set<string>()
  for (const e of json.engines) {
    const o = objet(e)
    if (!o) continue
    const metaMoteur = objet(o._metaData)
    if (metaMoteur?.hidden === true) continue
    const nom = texte(o._name) ?? texte(o.name)
    const alias = texte(metaMoteur?.alias) ?? (Array.isArray(o._definedAliases) ? texte(o._definedAliases[0]) : undefined)
    const urls = Array.isArray(o._urls) ? o._urls.map((u) => objet(u)).filter((u): u is Record<string, unknown> => !!u) : []
    const html = urls.find((u) => u.type === undefined || u.type === 'text/html')
    const url = html ? convertirModeleFirefox(String(html.template ?? ''), html.params) : undefined
    // Les moteurs fournis par Firefox n'ont pas leur adresse dans le fichier : on ne peut pas les transposer.
    if (!nom || !url) continue
    const motCle = alias ?? nom.toLowerCase().replace(/\s+/g, '')
    if (vus.has(motCle.toLowerCase())) continue
    vus.add(motCle.toLowerCase())
    const appFournit = o._isAppProvided === true || String(o._loadPath ?? '').startsWith('[app]')
    const parDefaut = idDefaut !== undefined && (idDefaut === texte(o.id) || idDefaut === nom)
    moteurs.push({ nom, motCle, url, ...(parDefaut ? { parDefaut: true } : {}), perso: !appFournit })
  }
  return moteurs
}

/** Moteur par défaut déclaré dans `search.json.mozlz4` : identifiant Firefox (`google`, `ddg`, `wikipedia-fr`…) et nom. */
export interface MoteurParDefautFirefox {
  /** `metaData.defaultEngineId` (Firefox ≥ 100) ou `metaData.current` (ancien format, c'est alors le nom). */
  id: string
  /** Nom du moteur si l'identifiant correspond à une entrée de `engines`. */
  nom?: string
  /** Intégré à Firefox (son adresse n'est pas dans le profil : à faire correspondre aux moteurs de Lyra). */
  integre: boolean
}

async function lireMoteurParDefaut(c: Contexte): Promise<MoteurParDefautFirefox | undefined> {
  const source = join(c.profil.chemin, 'search.json.mozlz4')
  if (!estFichier(source)) throw new ErreurImport('Aucun fichier de moteurs de recherche dans ce profil.')
  const json = objet(lireJsonMozlz4(await c.copieur.lire(source, { sujet: 'La liste des moteurs' }), 'la liste des moteurs', c.opts.tailleMaxFichier))
  if (!json) throw new ErreurImport('Liste des moteurs au format inattendu.')
  const meta = objet(json.metaData)
  const id = texte(meta?.defaultEngineId) ?? texte(meta?.current)
  if (!id) return undefined
  const moteur = (Array.isArray(json.engines) ? json.engines : []).map((e) => objet(e)).find((e) => e && (texte(e.id) === id || texte(e._name) === id))
  return { id, nom: texte(moteur?._name) ?? texte(moteur?.name), integre: moteur?._isAppProvided === true || String(moteur?._loadPath ?? '').startsWith('[app]') }
}

/**
 * Moteur par défaut du profil, même intégré à Firefox (Task 3 fait correspondre `google`, `ddg`, `bing`,
 * `wikipedia-fr`… aux moteurs de Lyra). `undefined` si le profil n'en déclare pas ; `Indisponible` si illisible.
 */
export async function lireMoteurParDefautFirefox(profil: ProfilDetecte, opts: Omit<OptionsLecture, 'elements'> = {}): Promise<MoteurParDefautFirefox | undefined | Indisponible> {
  if (!estDossier(profil.chemin)) return indisponible(`Le profil « ${profil.nom} » est introuvable (dossier supprimé ou déplacé).`)
  return avecCopieur((copieur) => proteger(() => lireMoteurParDefaut({ profil, copieur, opts })), optionsCopie(profil, opts)).catch((e: unknown) => versIndisponible(e))
}

// ---------------------------------------------------------------------------------------------------------------------
// Extensions : extensions.json

async function lireExtensions(c: Contexte): Promise<ExtensionImportee[]> {
  const source = join(c.profil.chemin, 'extensions.json')
  if (!estFichier(source)) throw new ErreurImport('Aucune liste d’extensions dans ce profil.')
  let json: Record<string, unknown> | undefined
  try {
    json = objet(JSON.parse((await c.copieur.lire(source, { sujet: 'La liste des extensions' })).toString('utf8').replace(/^﻿/, '')))
  } catch (e) {
    if (e instanceof ErreurImport) throw e
    throw new ErreurImport('Liste des extensions corrompue (JSON illisible).', { cause: e })
  }
  if (!json || !Array.isArray(json.addons)) throw new ErreurImport('Liste des extensions au format inattendu.')
  const extensions: ExtensionImportee[] = []
  for (const a of json.addons) {
    const o = objet(a)
    const id = texte(o?.id)
    if (!o || !id || o.type !== 'extension' || o.location !== 'app-profile') continue // thèmes, dictionnaires, modules internes
    const nom = texte(objet(o.defaultLocale)?.name) ?? id
    const signee = Number(o.signedState ?? 0) >= 2 && o.temporarilyInstalled !== true
    extensions.push({ id, nom, magasin: signee ? 'firefox' : 'inconnu', actif: o.active === true && o.userDisabled !== true && o.appDisabled !== true })
  }
  return extensions.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }))
}

// ---------------------------------------------------------------------------------------------------------------------
// Réglages transposables : prefs.js et content-prefs.sqlite

const USER_PREF = /^\s*user_pref\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*(.+?)\s*\)\s*;?\s*$/

/** Valeurs de `user_pref("nom", valeur);` (chaînes, nombres, booléens). Les lignes inattendues sont ignorées. */
export function lirePrefsJs(contenu: string): Map<string, unknown> {
  const prefs = new Map<string, unknown>()
  for (const ligne of contenu.split(/\r?\n/)) {
    const m = USER_PREF.exec(ligne)
    if (!m) continue
    try {
      prefs.set(JSON.parse(`"${m[1]}"`), JSON.parse(m[2]))
    } catch {
      // valeur non JSON (rare) : ignorée
    }
  }
  return prefs
}

async function lireReglages(c: Contexte): Promise<ReglagesImportes> {
  const source = join(c.profil.chemin, 'prefs.js')
  if (!estFichier(source)) throw new ErreurImport('Préférences du profil introuvables (prefs.js absent).')
  const prefs = lirePrefsJs((await c.copieur.lire(source, { sujet: 'Les préférences' })).toString('utf8'))
  const reglages: ReglagesImportes = {}

  const accueil = texte(prefs.get('browser.startup.homepage'))?.split('|').map((u) => u.trim()).find((u) => HTTP.test(u))
  if (accueil) reglages.pageAccueil = accueil

  const dossier = texte(prefs.get('browser.download.dir'))
  if (dossier && prefs.get('browser.download.folderList') === 2) reglages.dossierTelechargement = dossier

  const langue = texte(prefs.get('intl.accept_languages'))?.split(',')[0]?.trim()
  if (langue) reglages.langue = langue

  // Zoom par site : content-prefs.sqlite, réglage « browser.content.full-zoom » (facteur direct, 1 = 100 %).
  if (estFichier(join(c.profil.chemin, 'content-prefs.sqlite'))) {
    const zoom: Record<string, number> = {}
    try {
      const base = await ouvrirBaseDuProfil(c, 'content-prefs.sqlite', 'les réglages par site')
      let lignes: Ligne[] = []
      try {
        if (['groups', 'settings', 'prefs'].every((t) => base.tables().includes(t))) {
          lignes = base.lignes("SELECT g.name AS hote, p.value AS valeur FROM prefs p JOIN groups g ON g.id = p.groupID JOIN settings s ON s.id = p.settingID WHERE s.name = 'browser.content.full-zoom'")
        }
      } finally {
        base.fermer()
      }
      for (const l of lignes) {
        const hote = texte(l.hote)
        const facteur = Number(l.valeur)
        if (hote && Number.isFinite(facteur) && facteur > 0 && Math.abs(facteur - 1) > 1e-3) zoom[hote] = Math.round(facteur * 100) / 100
      }
    } catch {
      // le zoom est un bonus : base illisible = on s'en passe
    }
    if (Object.keys(zoom).length) reglages.zoomParSite = zoom
  }
  return reglages
}

// ---------------------------------------------------------------------------------------------------------------------
// Point d'entrée

const raison = (e: unknown): string => (e instanceof ErreurImport ? e.raison : `Lecture impossible : ${e instanceof Error ? e.message : String(e)}`)
const versIndisponible = (e: unknown): Indisponible => (e instanceof ErreurImport ? indisponible(e.raison, e.code) : indisponible(raison(e)))

async function proteger<T>(fn: () => Promise<T>): Promise<T | Indisponible> {
  try {
    return await fn()
  } catch (e) {
    return versIndisponible(e)
  }
}

const optionsCopie = (profil: ProfilDetecte, opts: OptionsLecture): OptionsCopie => ({
  navigateur: NOMS_NAVIGATEURS[profil.navigateur],
  dossierTemp: opts.dossierTemp,
  plateforme: opts.plateforme,
  tailleMaxFichier: opts.tailleMaxFichier,
  tailleMaxBase: opts.tailleMaxBase
})

/**
 * Lit les éléments demandés d'un profil Firefox. Ne lève jamais : un profil absent ou un élément illisible donne
 * `Indisponible { raison }`. Les copies temporaires sont supprimées avant le retour, même en cas d'erreur.
 */
export async function lireProfilFirefox(profil: ProfilDetecte, opts: OptionsLecture = {}): Promise<ResultatLecture> {
  const elements = opts.elements ?? ELEMENTS_IMPORT
  const donnees: DonneesImportees = {}
  if (!estDossier(profil.chemin)) {
    const absent = indisponible(`Le profil « ${profil.nom} » est introuvable (dossier supprimé ou déplacé).`)
    for (const e of elements) donnees[e] = absent
    return { donnees, compteurs: compter(donnees) }
  }
  try {
    await avecCopieur(async (copieur) => {
      const c: Contexte = { profil, copieur, opts }
      for (const element of elements) {
        if (opts.signal?.aborted) {
          Object.assign(donnees, { [element]: indisponible('Lecture annulée.', 'annule') })
          continue
        }
        opts.surProgression?.({ element, fait: 0 })
        switch (element) {
          case 'favoris':
            donnees.favoris = await proteger(() => lireFavoris(c))
            break
          case 'historique':
            donnees.historique = await proteger(async () => {
              const visites: Visite[] = []
              await parcourirHistorique(c, (lot) => void visites.push(...lot))
              return visites.sort((a, b) => b.date - a.date || a.url.localeCompare(b.url))
            })
            break
          case 'onglets':
            donnees.onglets = await proteger(() => lireOnglets(c))
            break
          case 'moteurs':
            donnees.moteurs = await proteger(() => lireMoteurs(c))
            break
          case 'extensions':
            donnees.extensions = await proteger(() => lireExtensions(c))
            break
          case 'reglages':
            donnees.reglages = await proteger(() => lireReglages(c))
            break
        }
      }
    }, optionsCopie(profil, opts))
  } catch (e) {
    for (const element of elements) if (donnees[element] === undefined) Object.assign(donnees, { [element]: versIndisponible(e) })
  }
  return { donnees, compteurs: compter(donnees) }
}

/** Historique en flux, lot par lot (voir `parcourirHistoriqueChromium`). Ne lève jamais côté lecture. */
export async function parcourirHistoriqueFirefox(
  profil: ProfilDetecte,
  opts: Omit<OptionsLecture, 'elements'>,
  surLot: (lot: Visite[]) => void | Promise<void>
): Promise<ResumeHistorique | Indisponible> {
  if (!estDossier(profil.chemin)) return indisponible(`Le profil « ${profil.nom} » est introuvable (dossier supprimé ou déplacé).`)
  const etat: { leve: boolean; erreur?: unknown } = { leve: false }
  const resultat = await avecCopieur(
    (copieur) =>
      proteger(() =>
        parcourirHistorique({ profil, copieur, opts }, async (lot) => {
          try {
            await surLot(lot)
          } catch (erreur) {
            etat.leve = true
            etat.erreur = erreur
            throw erreur
          }
        })
      ),
    optionsCopie(profil, opts)
  ).catch((e: unknown) => versIndisponible(e))
  if (etat.leve) throw etat.erreur
  return resultat
}
