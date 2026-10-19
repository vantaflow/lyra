/**
 * Lecteurs des profils Chromium (Chrome, Edge, Brave, Vivaldi) : favoris, historique, moteurs, onglets ouverts et
 * groupes, extensions, réglages transposables. Tout passe par une copie du fichier (voir `copie.ts`) ; chaque élément
 * illisible devient `Indisponible { raison }`, aucune exception ne remonte à l'appelant.
 *
 * Prêt pour un `utilityProcess` (Task 3) : aucun accès à Electron ; les fonctions exportées prennent des données
 * simples (`ProfilDetecte`, `ParametresLecture`) et rendent des données simples (`ResultatLecture`, sûres pour
 * `postMessage` / `structuredClone`). Seuls `surProgression`, `surLot` et `signal` ne se sérialisent pas : le processus
 * parent les remplace par des messages (progression, lot d'historique, ordre d'annulation → `AbortController`
 * dans le processus enfant). La partie SQLite (sql.js) est synchrone : c'est la raison d'être de cet isolement.
 */
import { statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { avecCopieur } from './copie'
import type { Copieur, OptionsCopie } from './copie'
import { erreurLectureBase, ouvrirBaseCopiee } from './sqlite'
import type { BaseLue, Ligne } from './sqlite'
import { lireSessionSnss } from './snss'
import { ErreurImport, ELEMENTS_IMPORT, JOURS_HISTORIQUE_PAR_DEFAUT, NOMS_NAVIGATEURS, compter, estIndisponible, indisponible } from './types'
import type {
  Compteurs,
  DonneesImportees,
  ElementImport,
  ExtensionImportee,
  FavorisImportes,
  Indisponible,
  Moteur,
  NoeudFavori,
  OngletsImportes,
  ProfilDetecte,
  ReglagesImportes,
  Visite
} from './types'

// ---------------------------------------------------------------------------------------------------------------------
// Options et résultat

export interface Progression {
  element: ElementImport
  /** Éléments lus jusqu'ici (historique : pages). */
  fait: number
}

/** Paramètres de lecture : données simples, à transmettre tels quels à un `utilityProcess`. */
export interface ParametresLecture {
  /** Éléments à lire (tous par défaut). */
  elements?: readonly ElementImport[]
  /** Fenêtre d'historique en jours (92 par défaut) ; `null` pour tout l'historique. */
  depuisJours?: number | null
  /** « Maintenant » (ms), pour des tests déterministes. */
  maintenant?: number
  /** Taille des lots de lecture de l'historique (2 000 par défaut). */
  tailleLot?: number
  /** Dossier où créer le dossier temporaire des copies (par défaut : celui du système). */
  dossierTemp?: string
  plateforme?: NodeJS.Platform
  /** Limites de taille (octets) remplaçant celles de `copie.ts` (64 Mio pour les fichiers, 1 Gio pour les bases). */
  tailleMaxFichier?: number
  tailleMaxBase?: number
}

export interface OptionsLecture extends ParametresLecture {
  surProgression?: (p: Progression) => void
  /** Abandon : vérifié entre deux éléments et entre deux lots d'historique ; le reste devient `Indisponible` (code `annule`). */
  signal?: AbortSignal
}

export interface ResultatLecture {
  donnees: DonneesImportees
  /** Chiffres de l'aperçu, calculés sur ce qui a été lu. */
  compteurs: Compteurs
}

// ---------------------------------------------------------------------------------------------------------------------
// Utilitaires

/** Chromium date en microsecondes depuis le 1er janvier 1601 (« WebKit time »). */
const EPOQUE_CHROMIUM_MS = 11_644_473_600_000

export function chromiumVersMs(microsecondes: unknown): number {
  const n = Number(microsecondes)
  return Number.isFinite(n) && n > 0 ? Math.max(0, Math.round(n / 1000 - EPOQUE_CHROMIUM_MS)) : 0
}

export const msVersChromium = (ms: number): number => (ms + EPOQUE_CHROMIUM_MS) * 1000

const JOUR_MS = 86_400_000
const HTTP = /^https?:\/\//i
const LIEN_FAVORI = /^(https?|ftp|file):/i

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

interface Contexte {
  profil: ProfilDetecte
  copieur: Copieur
  opts: OptionsLecture
  prefs: Map<string, Promise<Record<string, unknown> | undefined>>
}

const navigateur = (c: Contexte): string => NOMS_NAVIGATEURS[c.profil.navigateur]

/** JSON d'un fichier du profil (copié d'abord) ; `undefined` si le fichier n'existe pas, `ErreurImport` s'il est corrompu. */
async function jsonOptionnel(c: Contexte, ...chemin: string[]): Promise<Record<string, unknown> | undefined> {
  const source = join(c.profil.chemin, ...chemin)
  if (!estFichier(source)) return undefined
  const contenu = (await c.copieur.lire(source)).toString('utf8').replace(/^\uFEFF/, '')
  try {
    const v: unknown = JSON.parse(contenu)
    const o = objet(v)
    if (!o) throw new Error('racine inattendue')
    return o
  } catch (e) {
    throw new ErreurImport(`Fichier ${chemin.join('/')} corrompu ou illisible.`, { cause: e })
  }
}

/** `Preferences` ou `Secure Preferences`, lus une seule fois. */
function preferences(c: Contexte, nom: 'Preferences' | 'Secure Preferences'): Promise<Record<string, unknown> | undefined> {
  let p = c.prefs.get(nom)
  if (!p) c.prefs.set(nom, (p = jsonOptionnel(c, nom)))
  return p
}

/** Valeur imbriquée d'un objet JSON (« extensions.settings »). */
function chemin(o: unknown, ...cles: string[]): unknown {
  let courant = o
  for (const k of cles) courant = objet(courant)?.[k]
  return courant
}

// ---------------------------------------------------------------------------------------------------------------------
// Favoris

function convertirNoeud(brut: unknown, profondeur: number): NoeudFavori | undefined {
  const n = objet(brut)
  if (!n || profondeur > 100) return undefined
  const date = chromiumVersMs(n.date_added)
  if (n.type === 'url') {
    const url = texte(n.url)
    if (!url || !LIEN_FAVORI.test(url)) return undefined // javascript:, chrome://… : pas des favoris transposables
    return { type: 'lien', titre: texte(n.name) ?? url, url, date }
  }
  if (n.type === 'folder') {
    return { type: 'dossier', titre: texte(n.name) ?? '', date, enfants: enfantsFavoris(n.children, profondeur + 1) }
  }
  return undefined
}

function enfantsFavoris(brut: unknown, profondeur = 0): NoeudFavori[] {
  if (!Array.isArray(brut)) return []
  return brut.flatMap((b) => convertirNoeud(b, profondeur) ?? [])
}

async function lireFavoris(c: Contexte): Promise<FavorisImportes> {
  const json = await jsonOptionnel(c, 'Bookmarks')
  if (!json) throw new ErreurImport('Aucun fichier de favoris dans ce profil.')
  const racines = objet(json.roots)
  if (!racines) throw new ErreurImport('Fichier de favoris au format inattendu.')
  const autres = enfantsFavoris(objet(racines.other)?.children)
  const mobile = objet(racines.synced)
  const favorisMobiles = enfantsFavoris(mobile?.children)
  if (favorisMobiles.length) {
    autres.push({ type: 'dossier', titre: texte(mobile?.name) ?? 'Favoris mobiles', date: chromiumVersMs(mobile?.date_added), enfants: favorisMobiles })
  }
  return { barre: enfantsFavoris(objet(racines.bookmark_bar)?.children), autres }
}

// ---------------------------------------------------------------------------------------------------------------------
// Historique

interface ResumeHistorique {
  pages: number
  visites: number
}

const FILTRE_VISITES = 'v.visit_time >= ? AND u.hidden = 0 AND (v.transition & 255) NOT IN (3, 4)'

/**
 * Requêtes d'historique, de la plus à la moins efficace :
 * - `flux` : parcourt l'index `visits_url_index` (`INDEXED BY`) et regroupe par `v.url`, déjà trié par SQLite pour ce
 *   regroupement : la première ligne sort sans matérialiser quoi que ce soit (mesuré par la relecture : premier
 *   `step()` 0 ms contre 540 ms pour 600 000 visites, résultat identique). Pas de `ORDER BY` : l'ordre est celui des
 *   adresses ; `lireProfilChromium` trie ensuite par date ;
 * - `agrege` : même résultat sans l'index (matérialise le regroupement avant la première ligne) ;
 * - `urls` : sans table `visits` exploitable, `visit_count` et `last_visit_time` de `urls`.
 */
export const REQUETES_HISTORIQUE = {
  flux: `SELECT u.url AS url, u.title AS titre, MAX(v.visit_time) AS dernier, COUNT(*) AS n
         FROM visits v INDEXED BY visits_url_index JOIN urls u ON u.id = v.url
         WHERE ${FILTRE_VISITES}
         GROUP BY v.url`,
  agrege: `SELECT u.url AS url, u.title AS titre, MAX(v.visit_time) AS dernier, COUNT(*) AS n
         FROM visits v JOIN urls u ON u.id = v.url
         WHERE ${FILTRE_VISITES}
         GROUP BY u.id ORDER BY dernier DESC`,
  urls: `SELECT url, title AS titre, last_visit_time AS dernier, visit_count AS n
         FROM urls WHERE last_visit_time >= ? AND hidden = 0 ORDER BY last_visit_time DESC`
} as const

/** Requête à utiliser pour cette base : `flux` si l'index de Chrome est là, sinon repli. */
export function choisirRequeteHistorique(base: BaseLue): keyof typeof REQUETES_HISTORIQUE {
  const colonnesVisites = base.tables().includes('visits') ? base.colonnes('visits') : []
  if (!['url', 'visit_time', 'transition'].every((k) => colonnesVisites.includes(k))) return 'urls'
  if (base.indexes('visits').includes('visits_url_index') && base.valide(REQUETES_HISTORIQUE.flux)) return 'flux'
  return 'agrege'
}

function verifierSignal(c: Contexte): void {
  if (c.opts.signal?.aborted) throw new ErreurImport('Lecture annulée.', { code: 'annule' })
}

/**
 * Parcourt l'historique par lots. Les visites sont comptées dans la fenêtre demandée (table `visits`) quand elle est
 * disponible — « 18 420 visites en 92 jours », pas le total à vie de `urls.visit_count` — sinon on se rabat sur `urls`.
 * Seules les pages http(s) sont retenues, sans les sous-cadres (`hidden`) ni leurs visites.
 */
async function parcourirHistorique(c: Contexte, surLot: (lot: Visite[]) => void | Promise<void>): Promise<ResumeHistorique> {
  const source = join(c.profil.chemin, 'History')
  if (!estFichier(source)) throw new ErreurImport('Aucun historique dans ce profil.')
  verifierSignal(c)
  const copies = await c.copieur.copier(source, { base: true, sujet: "L'historique" })
  let base: BaseLue
  try {
    base = await ouvrirBaseCopiee(copies)
  } finally {
    await c.copieur.liberer(copies) // le contenu est en mémoire : la copie sur disque n'a plus d'utilité
  }
  try {
    if (!base.tables().includes('urls')) throw new ErreurImport("Historique d'un format inconnu (table des adresses absente).")
    const jours = c.opts.depuisJours === undefined ? JOURS_HISTORIQUE_PAR_DEFAUT : c.opts.depuisJours
    const maintenant = c.opts.maintenant ?? Date.now()
    const seuil = jours === null ? 0 : msVersChromium(maintenant - jours * JOUR_MS)

    const resume: ResumeHistorique = { pages: 0, visites: 0 }
    for await (const lignes of base.parLots(REQUETES_HISTORIQUE[choisirRequeteHistorique(base)], [seuil], c.opts.tailleLot ?? 2000)) {
      const lot: Visite[] = []
      for (const l of lignes) {
        const url = String(l.url ?? '')
        if (!HTTP.test(url)) continue
        const visites = Math.max(1, Math.trunc(Number(l.n)) || 1)
        lot.push({ url, titre: String(l.titre ?? ''), date: chromiumVersMs(l.dernier), visites })
        resume.visites += visites
      }
      resume.pages += lot.length
      if (lot.length) await surLot(lot)
      c.opts.surProgression?.({ element: 'historique', fait: resume.pages })
      verifierSignal(c)
    }
    return resume
  } catch (e) {
    throw erreurLectureBase(e, "l'historique", "L'historique est corrompu ou d'un format inattendu.")
  } finally {
    base.fermer()
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Moteurs de recherche et mots-clés

/**
 * Modèle d'adresse Chromium (`{searchTerms}`, `{google:baseURL}`, `{inputEncoding}`…) → modèle Lyra avec `%s`.
 * Les paramètres facultatifs propres à Google (`{google:RLZ}`…) sont supprimés. `undefined` si ce n'est pas une
 * recherche http(s) exploitable.
 */
export function convertirModeleMoteur(modele: string): string | undefined {
  let u = modele.trim().replace(/\{google:baseURL\}/g, 'https://www.google.com/')
  if (!u.includes('{searchTerms}')) return undefined
  u = u.replace(/\{searchTerms\}/g, '%s').replace(/\{inputEncoding\}/g, 'UTF-8').replace(/\{[^}]*\}/g, '')
  const [chemin, ...requete] = u.split('?')
  if (requete.length) {
    const params = requete
      .join('?')
      .split('&')
      .filter((p) => p !== '' && !/^[^=]*=$/.test(p)) // « hl= » : paramètre vidé, on l'enlève
    u = params.length ? `${chemin}?${params.join('&')}` : chemin
  }
  return HTTP.test(u) && u.includes('%s') ? u : undefined
}

async function lireMoteurs(c: Contexte): Promise<Moteur[]> {
  const source = join(c.profil.chemin, 'Web Data')
  if (!estFichier(source)) throw new ErreurImport('Aucune base de moteurs de recherche dans ce profil.')
  const copies = await c.copieur.copier(source, { base: true, sujet: 'La base des moteurs de recherche' })
  let base: BaseLue
  try {
    base = await ouvrirBaseCopiee(copies)
  } finally {
    await c.copieur.liberer(copies)
  }
  let lignes: Ligne[]
  try {
    if (!base.tables().includes('keywords')) throw new ErreurImport('Base de moteurs de recherche au format inconnu.')
    lignes = base.lignes('SELECT * FROM keywords')
  } catch (e) {
    throw erreurLectureBase(e, 'les moteurs de recherche', 'La base des moteurs de recherche est corrompue.')
  } finally {
    base.fermer()
  }

  const prefs = await preferences(c, 'Preferences').catch(() => undefined) // le moteur par défaut est un bonus : préférences illisibles = on s'en passe
  const parDefaut = objet(chemin(prefs, 'default_search_provider_data', 'template_url_data'))
  const motCleDefaut = texte(parDefaut?.keyword)?.toLowerCase()
  const moteurs: Moteur[] = []
  const vus = new Set<string>()
  for (const l of lignes) {
    const url = convertirModeleMoteur(String(l.url ?? ''))
    const motCle = String(l.keyword ?? '').trim()
    if (!url || !motCle || vus.has(motCle.toLowerCase())) continue
    const prepeuple = Number(l.prepopulate_id ?? 0) > 0
    const autogenere = Number(l.safe_for_autoreplace ?? 0) === 1 && !prepeuple // ajouté tout seul en visitant un site
    const inactif = Number(l.is_active ?? 0) === 2
    const raccourciDeDepart = Number(l.starter_pack_id ?? 0) > 0 // @bookmarks, @history, assistants intégrés : propres au navigateur
    if (autogenere || inactif || raccourciDeDepart) continue
    vus.add(motCle.toLowerCase())
    moteurs.push({
      nom: String(l.short_name ?? '').trim() || motCle,
      motCle,
      url,
      ...(motCleDefaut && motCle.toLowerCase() === motCleDefaut ? { parDefaut: true } : {}),
      perso: !prepeuple
    })
  }
  // Moteur par défaut connu des seules préférences (Brave, Edge…) : on l'ajoute s'il manque.
  const urlDefaut = parDefaut ? convertirModeleMoteur(String(parDefaut.url ?? '')) : undefined
  if (parDefaut && urlDefaut && motCleDefaut && !vus.has(motCleDefaut)) {
    moteurs.push({ nom: texte(parDefaut.short_name) ?? motCleDefaut, motCle: texte(parDefaut.keyword)!, url: urlDefaut, parDefaut: true, perso: false })
  }
  return moteurs
}

// ---------------------------------------------------------------------------------------------------------------------
// Onglets ouverts et groupes

async function lireOnglets(c: Contexte): Promise<OngletsImportes> {
  const dossier = join(c.profil.chemin, 'Sessions')
  const fichiers = async (d: string): Promise<string[]> =>
    estDossier(d)
      ? (await readdir(d))
          .filter((f) => /^Session_\d+$/.test(f)) // Tabs_* = onglets récemment fermés, pas ouverts
          .sort((a, b) => Number(b.slice(8)) - Number(a.slice(8))) // le plus récent d'abord
      : []
  const candidats = await fichiers(dossier)
  if (candidats.length === 0) {
    if ((await fichiers(join(c.profil.chemin, 'Sessions_Encrypted'))).length) {
      throw new ErreurImport(`La session de ${navigateur(c)} est chiffrée par le système : onglets illisibles hors du navigateur.`)
    }
    throw new ErreurImport('Aucune session enregistrée dans ce profil.')
  }
  let derniere = 'Fichier de session illisible.'
  for (const f of candidats.slice(0, 3)) {
    let octets: Buffer
    try {
      octets = await c.copieur.lire(join(dossier, f), { sujet: 'Le fichier de session' })
    } catch (e) {
      // Chromium garde le fichier de la session en cours ouvert en exclusivité (constaté sous Windows : Edge, Vivaldi) :
      // contrairement à l'historique, les onglets ouverts ne sont lisibles qu'une fois le navigateur fermé. On ne se
      // rabat pas sur une session plus ancienne, qui donnerait des onglets périmés.
      if (e instanceof ErreurImport && e.code === 'verrouille') {
        const nom = navigateur(c)
        throw new ErreurImport(`Les onglets ouverts de ${nom} ne sont lisibles que navigateur fermé : fermez ${nom} puis réessayez.`, { cause: e, code: 'verrouille' })
      }
      throw e
    }
    const resultat = lireSessionSnss(octets)
    if (!estIndisponible(resultat)) return resultat
    // Session récente valide mais sans onglet : c'est la vérité, on ne retombe pas sur une session plus ancienne
    // (onglets périmés). On ne remonte dans le temps que si le fichier est illisible ou chiffré.
    if (resultat.code === 'vide') throw new ErreurImport(resultat.raison, { code: 'vide' })
    derniere = resultat.raison
  }
  throw new ErreurImport(derniere)
}

// ---------------------------------------------------------------------------------------------------------------------
// Extensions

const ID_EXTENSION = /^[a-p]{32}$/
/**
 * Emplacements d'installation ignorés (`ManifestLocation`) : 0 invalide, 5 composant, 8 ligne de commande, 10 composant
 * externe. Les autres (1 interne, 2/3 externes, 4 dépaquetée, 6/7/9 stratégie…) sont de vraies extensions de l'utilisateur,
 * du magasin ou non.
 */
const EMPLACEMENTS_IGNORES = new Set([0, 5, 8, 10])
const MISE_A_JOUR_CHROME = /clients2\.(google|googleusercontent)\.com\/service\/update2\/crx/i
const MISE_A_JOUR_EDGE = /edge\.microsoft\.com\/extensionwebstorebase\//i

/** Dossier de la version installée (`Extensions/<id>/<version>`), d'après `path` des préférences sinon la plus récente. */
async function dossierExtension(c: Contexte, id: string, entree: Record<string, unknown> | undefined): Promise<string | undefined> {
  const racine = join(c.profil.chemin, 'Extensions', id)
  const chemin = texte(entree?.path)
  if (chemin) {
    const complet = isAbsolute(chemin) ? chemin : join(c.profil.chemin, 'Extensions', chemin)
    if (estDossier(complet)) return complet
  }
  if (!estDossier(racine)) return undefined
  const versions = (await readdir(racine, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
  versions.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
  return versions[0] ? join(racine, versions[0]) : undefined
}

async function lireJsonSimple(c: Contexte, source: string): Promise<Record<string, unknown> | undefined> {
  if (!estFichier(source)) return undefined
  try {
    return objet(JSON.parse((await c.copieur.lire(source)).toString('utf8').replace(/^\uFEFF/, '')))
  } catch {
    return undefined
  }
}

/** Nom d'extension ; résout `__MSG_clé__` dans `_locales/<langue>/messages.json`. */
async function nomExtension(c: Contexte, id: string, dossier: string | undefined, manifest: Record<string, unknown> | undefined): Promise<string> {
  const mani = manifest?.name ? manifest : ((dossier && (await lireJsonSimple(c, join(dossier, 'manifest.json')))) || manifest)
  const nom = texte(mani?.name)
  if (!nom) return id
  const msg = /^__MSG_(.+)__$/.exec(nom)
  if (!msg || !dossier) return msg ? id : nom
  const locales = join(dossier, '_locales')
  const langues = [texte(mani?.default_locale), 'en', 'en_US']
  if (estDossier(locales)) langues.push(...(await readdir(locales)))
  for (const langue of langues) {
    if (!langue) continue
    const messages = await lireJsonSimple(c, join(locales, langue, 'messages.json'))
    if (!messages) continue
    const cle = Object.keys(messages).find((k) => k.toLowerCase() === msg[1].toLowerCase())
    const valeur = texte(objet(cle ? messages[cle] : undefined)?.message)
    if (valeur) return valeur
  }
  return id
}

async function lireExtensions(c: Contexte): Promise<ExtensionImportee[]> {
  // Chaque fichier est lu de façon tolérante : `Secure Preferences` corrompue → on se contente de `Preferences`, et inversement.
  const lu = (nom: 'Preferences' | 'Secure Preferences'): Promise<{ v?: Record<string, unknown>; e?: unknown }> =>
    preferences(c, nom).then(
      (v) => ({ v }),
      (e: unknown) => ({ e })
    )
  const [p1, p2] = [await lu('Preferences'), await lu('Secure Preferences')]
  const [prefs, securise] = [p1.v, p2.v]
  if (!prefs && !securise) {
    const e = p1.e ?? p2.e
    throw e instanceof ErreurImport ? e : new ErreurImport('Préférences du profil introuvables : extensions illisibles.')
  }
  // Sous Windows, Chrome range les extensions dans `Secure Preferences` ; ailleurs, dans `Preferences`.
  const reglages = { ...objet(chemin(prefs, 'extensions', 'settings')) }
  for (const [id, valeur] of Object.entries(objet(chemin(securise, 'extensions', 'settings')) ?? {})) {
    reglages[id] = { ...objet(reglages[id]), ...objet(valeur) }
  }

  const extensions: ExtensionImportee[] = []
  for (const [id, brut] of Object.entries(reglages)) {
    const entree = objet(brut)
    if (!ID_EXTENSION.test(id) || !entree) continue
    if (typeof entree.location !== 'number' || EMPLACEMENTS_IGNORES.has(entree.location)) continue // sans emplacement : simple reste de réglages, pas une extension installée
    if (entree.was_installed_by_default === true || entree.was_installed_by_oem === true) continue // préinstallées : pas un choix de l'utilisateur
    const manifest = objet(entree.manifest)
    if (manifest?.theme || manifest?.app) continue // thèmes et anciennes applications Chrome
    const miseAJour = String(manifest?.update_url ?? '')
    const edge = MISE_A_JOUR_EDGE.test(miseAJour)
    const duMagasin = entree.from_webstore === true || MISE_A_JOUR_CHROME.test(miseAJour)
    const magasin: ExtensionImportee['magasin'] = edge ? 'edge' : duMagasin ? 'chrome' : 'inconnu' // inconnu : à la main, dépaquetée…
    const dossier = await dossierExtension(c, id, entree)
    const raisons = entree.disable_reasons
    const desactivee = entree.state === 0 || (typeof raisons === 'number' && raisons > 0) || (Array.isArray(raisons) && raisons.length > 0)
    extensions.push({ id, nom: await nomExtension(c, id, dossier, manifest), magasin, actif: !desactivee })
  }

  if (Object.keys(reglages).length === 0) {
    // Aucun réglage d'extension (préférences minimales) : repli sur les dossiers installés.
    const racine = join(c.profil.chemin, 'Extensions')
    for (const id of estDossier(racine) ? await readdir(racine) : []) {
      if (!ID_EXTENSION.test(id)) continue
      const dossier = await dossierExtension(c, id, undefined)
      const manifest = dossier ? await lireJsonSimple(c, join(dossier, 'manifest.json')) : undefined
      if (manifest?.theme) continue
      extensions.push({ id, nom: await nomExtension(c, id, dossier, manifest), magasin: 'chrome', actif: true })
    }
  }
  return extensions.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }))
}

// ---------------------------------------------------------------------------------------------------------------------
// Réglages transposables

async function lireReglages(c: Contexte): Promise<ReglagesImportes> {
  const prefs = await preferences(c, 'Preferences')
  if (!prefs) throw new ErreurImport('Préférences du profil introuvables.')
  const reglages: ReglagesImportes = {}

  const accueil = texte(prefs.homepage)
  const accueilEstNouvelOnglet = prefs.homepage_is_newtabpage === true
  if (accueil && !accueilEstNouvelOnglet && HTTP.test(accueil)) reglages.pageAccueil = accueil
  else if (chemin(prefs, 'session', 'restore_on_startup') === 4) {
    // « Ouvrir des pages précises au démarrage » : la première tient lieu de page d'accueil.
    const pages = chemin(prefs, 'session', 'startup_urls')
    const premiere = Array.isArray(pages) ? texte(pages[0]) : undefined
    if (premiere && HTTP.test(premiere)) reglages.pageAccueil = premiere
  }

  const dossier = texte(chemin(prefs, 'download', 'default_directory'))
  if (dossier) reglages.dossierTelechargement = dossier

  const langue = texte(chemin(prefs, 'intl', 'accept_languages'))?.split(',')[0]?.trim()
  if (langue) reglages.langue = langue

  // Zoom : niveau n → facteur 1,2^n (Chromium) ; une table par partition de stockage, la principale s'appelle « x ».
  const zoom: Record<string, number> = {}
  for (const hotes of Object.values(objet(chemin(prefs, 'partition', 'per_host_zoom_levels')) ?? {})) {
    for (const [hote, valeur] of Object.entries(objet(hotes) ?? {})) {
      const niveau = Number(objet(valeur)?.zoom_level)
      if (hote && Number.isFinite(niveau) && Math.abs(niveau) > 1e-3) zoom[hote] = Math.round(1.2 ** niveau * 100) / 100
    }
  }
  if (Object.keys(zoom).length) reglages.zoomParSite = zoom
  return reglages
}

// ---------------------------------------------------------------------------------------------------------------------
// Point d'entrée

function raison(e: unknown): string {
  return e instanceof ErreurImport ? e.raison : `Lecture impossible : ${e instanceof Error ? e.message : String(e)}`
}

/** Une erreur quelconque devient un `Indisponible` lisible, avec son code éventuel. */
function versIndisponible(e: unknown): Indisponible {
  return indisponible(raison(e), e instanceof ErreurImport ? e.code : undefined)
}

async function proteger<T>(fn: () => Promise<T>): Promise<T | Indisponible> {
  try {
    return await fn()
  } catch (e) {
    return versIndisponible(e)
  }
}

/**
 * Lit les éléments demandés d'un profil Chromium. Ne lève jamais : un profil absent ou un élément illisible donne
 * `Indisponible { raison }`. Les copies temporaires sont supprimées avant le retour, même en cas d'erreur.
 */
function optionsCopie(profil: ProfilDetecte, opts: ParametresLecture): OptionsCopie {
  return {
    navigateur: NOMS_NAVIGATEURS[profil.navigateur],
    dossierTemp: opts.dossierTemp,
    plateforme: opts.plateforme,
    tailleMaxFichier: opts.tailleMaxFichier,
    tailleMaxBase: opts.tailleMaxBase
  }
}

export async function lireProfilChromium(profil: ProfilDetecte, opts: OptionsLecture = {}): Promise<ResultatLecture> {
  const elements = opts.elements ?? ELEMENTS_IMPORT
  const donnees: DonneesImportees = {}
  const copie = optionsCopie(profil, opts)

  if (!estDossier(profil.chemin)) {
    const absent = indisponible(`Le profil « ${profil.nom} » est introuvable (dossier supprimé ou déplacé).`)
    for (const e of elements) donnees[e] = absent
    return { donnees, compteurs: compter(donnees) }
  }

  try {
    await avecCopieur(async (copieur) => {
      const c: Contexte = { profil, copieur, opts, prefs: new Map() }
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
              // Le plus récent d'abord : la requête en flux ne trie pas.
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
    }, copie)
  } catch (e) {
    // Dossier temporaire impossible à créer, par exemple : tout ce qui n'a pas été lu est indisponible.
    for (const element of elements) if (donnees[element] === undefined) Object.assign(donnees, { [element]: versIndisponible(e) })
  }
  return { donnees, compteurs: compter(donnees) }
}

/**
 * Historique en flux : `surLot` reçoit les visites lot par lot (sans tout garder en mémoire), pour l'application
 * dans Lyra (Task 3). Ne lève jamais côté lecture ; une erreur de `surLot` interrompt le parcours et remonte.
 */
export async function parcourirHistoriqueChromium(
  profil: ProfilDetecte,
  opts: Omit<OptionsLecture, 'elements'>,
  surLot: (lot: Visite[]) => void | Promise<void>
): Promise<{ pages: number; visites: number } | Indisponible> {
  if (!estDossier(profil.chemin)) return indisponible(`Le profil « ${profil.nom} » est introuvable (dossier supprimé ou déplacé).`)
  const etat: { leve: boolean; erreur?: unknown } = { leve: false }
  const resultat = await avecCopieur(
    (copieur) =>
      proteger(() =>
        parcourirHistorique({ profil, copieur, opts, prefs: new Map() }, async (lot) => {
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
