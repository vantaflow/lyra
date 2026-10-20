/**
 * Paquet `.lyra` : un zip (pur JS, fflate) chiffré tout entier (`chiffrement.ts`). Contenu :
 *   manifest.json        format, version, version de Lyra, date, liste des fichiers, présence de cookies
 *   reglages.json        réglages (sans thème, règles par site ni extensions, rangés ci-dessous)
 *   regles-sites.json    règles par site (`Settings.sites`)
 *   themes.json          `{ theme }`
 *   extensions.json      `{ enAttente, installees }` : file d'import (identifiant, nom, magasin, état) et extensions installées
 *                        (identifiant, nom, magasin, source, version, active), jamais les binaires ni les dossiers
 *   ciel.json            constellations, étoiles, épingles (format `lyra-ciel`)
 *   favoris.json         favoris et leurs dossiers
 *   historique.jsonl     une ligne par visite `{url,titre,date}`
 *   cookies.json         seulement si l'utilisateur l'a demandé (cookies de `persist:lyra`)
 * Aucun mot de passe : Lyra n'en stocke pas, et toute clé de réglage ressemblant à un secret est retirée à l'écriture.
 * Pur (sans Electron) : les sources sont injectées.
 */
import { strToU8, unzipSync, zip } from 'fflate'
import type { ExtensionInstallee as SettingsExtension, Settings, SkyState } from '../../shared/types'
import type { Favori } from '../bookmarks/Bookmarks'
import type { ExtensionImportee, Visite } from '../import/types'
import { cielDepuisJson, cielsVersJson, type CielFichier } from './ciel'
import { ErreurPaquet, chiffrer, chiffrerAvecCle, dechiffrer, type CleDerivee } from './chiffrement'

export const FORMAT_PAQUET = 'lyra-paquet'
export const VERSION_PAQUET = 1
const TAILLE_LOT = 5000
const TAILLE_FICHIER_MAX = 512 * 1024 * 1024
const TAILLE_TOTALE_MAX = 1024 * 1024 * 1024
const MAX_COOKIES = 50_000
const MAX_EXTENSIONS = 500

export interface CookieSauvegarde {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  hostOnly: boolean
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
  /** Secondes depuis 1970 ; absent : cookie de session. */
  expirationDate?: number
}

/** Extension installée, telle que listée dans `extensions.json` (`installees`) : de quoi la retrouver, jamais ses fichiers. */
export interface ExtensionPaquet {
  id: string
  nom: string
  magasin: SettingsExtension['magasin']
  source: SettingsExtension['source']
  version: string
  active: boolean
}

export interface SourcesPaquet {
  version: string
  reglages: Settings
  favoris: Favori[]
  /** Ciels des fenêtres NORMALES (jamais les privées) ; écrits dans `ciel.json` (voir `CielFichier`). */
  ciels?: SkyState[]
  /** Visites une à une ; peut être un générateur (jamais copié en entier avant d'être écrit). */
  visites(): Iterable<{ url: string; titre: string; date: number }>
  /** Présent seulement si l'utilisateur l'a demandé. */
  cookies?: CookieSauvegarde[]
}

export interface Manifeste {
  format: typeof FORMAT_PAQUET
  version: number
  lyra: string
  date: string
  contenu: string[]
  cookies: boolean
  comptes: { favoris: number; visites: number; etoiles: number; extensions: number; cookies: number }
}

export interface ContenuPaquet {
  manifest: Manifeste
  /** Patch de réglages à valider (`patchImporte`) : sans `import`, avec thème et règles par site. */
  reglages: Record<string, unknown>
  extensions: ExtensionImportee[]
  favoris: Favori[]
  ciel?: CielFichier
  visites: AsyncIterable<Visite[]>
  cookies?: CookieSauvegarde[]
  /** Éléments du paquet illisibles et ignorés (le reste est lu). */
  avertissements: string[]
}

/** Noms de clé ENTIERS : « passerelles » ne doit pas être pris pour « pass ». */
const SECRET = /^(password|passphrase|motdepasse|mdp|secrets?|credentials?|tokens?)$/i

/** Copie profonde d'un objet JSON sans aucune clé ressemblant à un secret. */
function sansSecrets(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sansSecrets)
  if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).filter(([k]) => !SECRET.test(k)).map(([k, x]) => [k, sansSecrets(x)]))
  return v
}

const pauseParDefaut = (): Promise<void> => new Promise((r) => setImmediate(r))

const compresser = (fichiers: Record<string, Uint8Array>): Promise<Uint8Array> =>
  new Promise((ok, ko) => zip(fichiers, { level: 6 }, (e, d) => (e ? ko(e) : ok(d))))

/** Le zip en clair (pour les tests et pour le chiffrement). L'historique est écrit par lots, avec une pause entre deux lots. */
export async function construireZip(src: SourcesPaquet, opts: { pause?: () => Promise<void>; date?: Date } = {}): Promise<Uint8Array> {
  const pause = opts.pause ?? pauseParDefaut
  const { sites, theme, import: fileImport, extensions: registre, ...reste } = sansSecrets(src.reglages) as Settings & { import: Settings['import'] }
  void fileImport
  // Le registre des extensions (dossiers locaux compris) n'entre pas dans reglages.json : seule la mise à jour automatique y reste.
  const reglagesSansRegistre = { ...reste, extensions: { majAuto: registre?.majAuto ?? true } }
  const enAttente: ExtensionImportee[] = (src.reglages.import?.extensionsEnAttente ?? []).map((e) => ({ id: e.id, nom: e.nom, magasin: e.magasin, actif: e.actif, ...(e.imposee ? { imposee: true } : {}) }))
  const installees: ExtensionPaquet[] = (src.reglages.extensions?.installees ?? []).map((e) => ({ id: e.id, nom: e.nom, magasin: e.magasin, source: e.source, version: e.version, active: e.active }))
  const extensions = { enAttente, installees }
  const fichiers: Record<string, Uint8Array> = {
    'reglages.json': strToU8(JSON.stringify(reglagesSansRegistre, null, 2)),
    'regles-sites.json': strToU8(JSON.stringify(sites ?? {}, null, 2)),
    'themes.json': strToU8(JSON.stringify({ theme })),
    'extensions.json': strToU8(JSON.stringify(extensions, null, 2)),
    'favoris.json': strToU8(JSON.stringify(src.favoris.map((f) => ({ url: f.url, title: f.title, ...(f.dossier ? { dossier: f.dossier } : {}), date: f.date })), null, 2))
  }
  if (src.ciels) fichiers['ciel.json'] = strToU8(cielsVersJson(src.ciels, opts.date))
  const morceaux: string[] = []
  let lot: string[] = []
  let visites = 0
  for (const v of src.visites()) {
    lot.push(JSON.stringify({ url: v.url, titre: v.titre, date: v.date }))
    visites++
    if (lot.length >= TAILLE_LOT) {
      morceaux.push(lot.join('\n'))
      lot = []
      await pause()
    }
  }
  if (lot.length) morceaux.push(lot.join('\n'))
  fichiers['historique.jsonl'] = strToU8(morceaux.length ? morceaux.join('\n') + '\n' : '')
  if (src.cookies) fichiers['cookies.json'] = strToU8(JSON.stringify(src.cookies))
  const manifest: Manifeste = {
    format: FORMAT_PAQUET,
    version: VERSION_PAQUET,
    lyra: src.version,
    date: (opts.date ?? new Date()).toISOString(),
    contenu: [...Object.keys(fichiers)].sort(),
    cookies: src.cookies !== undefined,
    comptes: { favoris: src.favoris.length, visites, etoiles: src.ciels?.reduce((n, c) => n + c.stars.length, 0) ?? 0, extensions: new Set([...enAttente.map((e) => `${e.magasin}:${e.id}`), ...installees.map((e) => `${e.magasin}:${e.id}`)]).size, cookies: src.cookies?.length ?? 0 }
  }
  fichiers['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  await pause()
  return compresser(fichiers)
}

export async function creerPaquet(src: SourcesPaquet, phrase: string, opts: { pause?: () => Promise<void>; date?: Date } = {}): Promise<Uint8Array> {
  return chiffrer(await construireZip(src, opts), phrase)
}

/** Sauvegarde automatique : la clé a été dérivée une fois (phrase jamais conservée), chaque fichier a son IV. */
export async function creerPaquetAvecCle(src: SourcesPaquet, cle: CleDerivee, opts: { pause?: () => Promise<void>; date?: Date } = {}): Promise<Uint8Array> {
  return chiffrerAvecCle(await construireZip(src, opts), cle)
}

// --- Lecture ---------------------------------------------------------------------------------------------------------

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const dec = new TextDecoder()

function favoriValide(f: unknown): Favori | null {
  if (!estObjet(f) || typeof f.url !== 'string' || !f.url || typeof f.title !== 'string') return null
  return { url: f.url.slice(0, 8192), title: f.title.slice(0, 1000), ...(typeof f.dossier === 'string' && f.dossier ? { dossier: f.dossier.slice(0, 1000) } : {}), date: typeof f.date === 'number' && Number.isFinite(f.date) ? f.date : 0 }
}

const MAGASINS = ['chrome', 'edge', 'firefox', 'inconnu']
function extensionValide(e: unknown): ExtensionImportee | null {
  if (!estObjet(e) || typeof e.id !== 'string' || !e.id || e.id.length > 200 || typeof e.nom !== 'string' || typeof e.magasin !== 'string' || !MAGASINS.includes(e.magasin)) return null
  return { id: e.id, nom: e.nom.slice(0, 200), magasin: e.magasin as ExtensionImportee['magasin'], actif: e.actif === true, ...(e.imposee === true ? { imposee: true } : {}) }
}

const SAMESITE = ['unspecified', 'no_restriction', 'lax', 'strict']
export function cookieValide(c: unknown): CookieSauvegarde | null {
  if (!estObjet(c) || typeof c.name !== 'string' || !c.name || typeof c.value !== 'string' || typeof c.domain !== 'string' || !c.domain.replace(/^\./, '')) return null
  return {
    name: c.name.slice(0, 4096),
    value: c.value.slice(0, 8192),
    domain: c.domain.slice(0, 255),
    path: typeof c.path === 'string' && c.path.startsWith('/') ? c.path.slice(0, 1024) : '/',
    secure: c.secure === true,
    httpOnly: c.httpOnly === true,
    hostOnly: c.hostOnly === true,
    ...(typeof c.sameSite === 'string' && SAMESITE.includes(c.sameSite) ? { sameSite: c.sameSite as CookieSauvegarde['sameSite'] } : {}),
    ...(typeof c.expirationDate === 'number' && Number.isFinite(c.expirationDate) ? { expirationDate: c.expirationDate } : {})
  }
}

async function* lotsDeVisites(jsonl: string): AsyncGenerator<Visite[]> {
  let lot: Visite[] = []
  let debut = 0
  while (debut < jsonl.length) {
    let fin = jsonl.indexOf('\n', debut)
    if (fin === -1) fin = jsonl.length
    const ligne = jsonl.slice(debut, fin)
    debut = fin + 1
    if (!ligne) continue
    try {
      const v: unknown = JSON.parse(ligne)
      if (estObjet(v) && typeof v.url === 'string' && v.url && typeof v.date === 'number' && Number.isFinite(v.date)) {
        lot.push({ url: v.url, titre: typeof v.titre === 'string' ? v.titre : '', date: v.date, visites: 1 })
        if (lot.length >= TAILLE_LOT) {
          yield lot
          lot = []
        }
      }
    } catch {
      /* ligne illisible : ignorée */
    }
  }
  if (lot.length) yield lot
}

/**
 * Déchiffre et lit un paquet. Tout est lu et validé AVANT que l'appelant n'écrive quoi que ce soit : une erreur ici
 * (phrase fausse, fichier endommagé, version plus récente) ne laisse aucune trace.
 */
export async function lirePaquet(donnees: Uint8Array, phrase: string): Promise<ContenuPaquet> {
  const zipClair = await dechiffrer(donnees, phrase)
  let total = 0
  let fichiers: Record<string, Uint8Array>
  try {
    fichiers = unzipSync(zipClair, {
      filter: (f) => {
        total += f.originalSize
        if (f.originalSize > TAILLE_FICHIER_MAX || total > TAILLE_TOTALE_MAX) throw new ErreurPaquet('Ce paquet est trop volumineux pour être lu.', 'volumineux')
        return /^[a-z-]+\.(json|jsonl)$/.test(f.name)
      }
    })
  } catch (e) {
    if (e instanceof ErreurPaquet) throw e
    throw new ErreurPaquet('Paquet illisible : le contenu est endommagé.', 'format')
  }
  const texte = (nom: string): string | undefined => (fichiers[nom] ? dec.decode(fichiers[nom]) : undefined)
  let manifest: Manifeste
  try {
    const m: unknown = JSON.parse(texte('manifest.json') ?? '')
    if (!estObjet(m) || m.format !== FORMAT_PAQUET || typeof m.version !== 'number') throw new Error()
    manifest = m as unknown as Manifeste
  } catch {
    throw new ErreurPaquet('Paquet illisible : le contenu est endommagé.', 'format')
  }
  if (manifest.version > VERSION_PAQUET) throw new ErreurPaquet('Ce paquet vient d’une version plus récente de Lyra.', 'version')

  const avertissements: string[] = []
  const json = (nom: string): unknown => {
    const t = texte(nom)
    if (t === undefined) return undefined
    try {
      return JSON.parse(t)
    } catch {
      avertissements.push(`${nom} est illisible et a été ignoré.`)
      return undefined
    }
  }
  const reglages: Record<string, unknown> = {}
  const base = json('reglages.json')
  if (estObjet(base)) Object.assign(reglages, base)
  else if (base !== undefined) avertissements.push('reglages.json est invalide et a été ignoré.')
  delete reglages.import
  const sites = json('regles-sites.json')
  if (estObjet(sites)) reglages.sites = sites
  const themes = json('themes.json')
  if (estObjet(themes) && typeof themes.theme === 'string') reglages.theme = themes.theme

  const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  const favoris = liste(json('favoris.json')).map(favoriValide).filter((f): f is Favori => f !== null)
  const brutExt = json('extensions.json')
  const enAttente = liste(estObjet(brutExt) ? brutExt.enAttente : brutExt) // ancien format : tableau seul
  const extensions = enAttente.slice(0, MAX_EXTENSIONS).map(extensionValide).filter((e): e is ExtensionImportee => e !== null)
  // Extensions installées : celles du catalogue (Chrome Web Store, AMO) vont dans la file d'import pour réinstallation (jamais
  // d'installation silencieuse : l'utilisateur confirme dans lyra://extensions) ; les locales ne se réinstallent pas.
  for (const e of liste(estObjet(brutExt) ? brutExt.installees : undefined).slice(0, MAX_EXTENSIONS)) {
    if (!estObjet(e) || typeof e.id !== 'string' || !e.id || typeof e.nom !== 'string') continue
    const nom = e.nom.slice(0, 200)
    const magasin = e.source === 'cws' ? 'chrome' : e.source === 'amo' ? 'firefox' : undefined
    if (!magasin) {
      avertissements.push(`L'extension « ${nom} » est locale (installée depuis un fichier ou un dossier) : non réinstallable, à remettre à la main.`)
      continue
    }
    const valide = extensionValide({ id: e.id, nom, magasin, actif: e.active !== false })
    if (valide && !extensions.some((x) => x.id === valide.id && x.magasin === valide.magasin) && extensions.length < MAX_EXTENSIONS) extensions.push(valide)
  }
  let ciel: CielFichier | undefined
  const cielTexte = texte('ciel.json')
  if (cielTexte !== undefined) {
    try {
      ciel = cielDepuisJson(cielTexte)
    } catch {
      avertissements.push('ciel.json est invalide et a été ignoré.')
    }
  }
  const cookiesBruts = json('cookies.json')
  const cookies = Array.isArray(cookiesBruts) ? cookiesBruts.slice(0, MAX_COOKIES).map(cookieValide).filter((c): c is CookieSauvegarde => c !== null) : undefined
  return { manifest, reglages, extensions, favoris, ...(ciel ? { ciel } : {}), visites: lotsDeVisites(texte('historique.jsonl') ?? ''), ...(cookies ? { cookies } : {}), avertissements }
}
