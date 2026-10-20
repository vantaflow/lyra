/** « Règles par site » : valeurs → cellules du tableau, pastille et route profonde (ParametresSites.dc.html). Module pur. */
import type { RegleSite } from '../../shared/types'
import { cleCanonique, cleDe, resoudre, type RegleEffective } from '../../main/settings/sites'

export type Teinte = 'vert' | 'rouge' | 'violet'
/** Contenu d'une cellule : texte brut, ou étiquette colorée quand `teinte` est présente. */
export interface Cellule {
  texte: string
  teinte?: Teinte
  /** Valeur reçue d'un motif `*.hôte` ou d'une règle plus large, non écrite dans la règle de la ligne. */
  herite?: boolean
}

const sans = (texte: string): Cellule => ({ texte })
const AUCUNE: Cellule = { texte: '—' }

export function celluleBoucliers(r: RegleSite): Cellule {
  const b = r.boucliers
  if (b === false || b === 'desactives') return { texte: 'Désactivés', teinte: 'rouge' }
  if (b === 'strict') return { texte: 'Strict', teinte: 'vert' }
  return { texte: 'Standard', teinte: 'vert' }
}

const COOKIES: Record<NonNullable<RegleSite['cookies']>, string> = {
  tous: 'Tous',
  'premiere-partie': '1re partie',
  bloques: 'Bloqués',
  session: 'Session seulement'
}
export const celluleCookies = (r: RegleSite): Cellule => sans(COOKIES[r.cookies ?? 'tous'])

export const celluleScripts = (r: RegleSite): Cellule => (r.scripts === 'bloques' ? { texte: 'Bloqués', teinte: 'rouge' } : sans('Autorisés'))

/** Inerte : le calcul réel (extensions mises à `false` sur le site) arrive avec la Tâche 20 (jalon B). */
export const celluleExtensions = (_r: RegleSite): Cellule => sans('Toutes')

/** « 110 % » ; le facteur de zoom est mémorisé en rapport (1,1). */
export const libelleZoom = (zoom: number): string => `${Math.round(zoom * 100)} %`
/** Paliers du sélecteur de zoom d'une règle (Décision A). */
export const PALIERS_ZOOM: readonly number[] = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

/** Identifiant de l'option d'un zoom : « defaut » (absent) ou le pourcentage (« 110 »). */
export const idZoom = (zoom: number | undefined): string => (typeof zoom === 'number' ? String(Math.round(zoom * 100)) : 'defaut')

/** Zoom d'une option : `null` pour « Par défaut » (retire `zoom` de la règle), `undefined` si l'identifiant n'en est pas un. */
export function zoomDepuisId(id: string): number | null | undefined {
  if (id === 'defaut') return null
  const pourcent = Number(id)
  return Number.isInteger(pourcent) && pourcent >= 25 && pourcent <= 500 ? pourcent / 100 : undefined
}

/** Options du sélecteur : « Par défaut », les paliers, et le zoom actuel s'il n'en est pas un (zoom au clavier : 120 %…). */
export function optionsZoom(zoom: number | undefined): { id: string; libelle: string }[] {
  const valeurs = [...PALIERS_ZOOM]
  if (typeof zoom === 'number' && !valeurs.some((v) => idZoom(v) === idZoom(zoom))) valeurs.push(Math.round(zoom * 100) / 100)
  valeurs.sort((a, b) => a - b)
  return [{ id: 'defaut', libelle: 'Par défaut' }, ...valeurs.map((v) => ({ id: idZoom(v), libelle: libelleZoom(v) }))]
}

export const celluleZoom = (r: RegleSite): Cellule => (typeof r.zoom === 'number' ? sans(libelleZoom(r.zoom)) : AUCUNE)

export const celluleDnd = (r: RegleSite): Cellule => (r.exceptionDnd === true ? sans('Exception') : AUCUNE)

/** « CSS », « CSS + script » ; « Script » (hors design) quand il n'y a qu'un script. */
export function celluleStyle(r: RegleSite): Cellule {
  const css = typeof r.style === 'string' && r.style.length > 0
  const script = (r.scriptsPerso?.length ?? 0) > 0
  if (css && script) return { texte: 'CSS + script', teinte: 'violet' }
  if (css) return { texte: 'CSS', teinte: 'violet' }
  if (script) return { texte: 'Script', teinte: 'violet' }
  return AUCUNE
}

/** Couleurs de pastille du design (les teintes de sites de ParametresSites.dc.html). */
export const PALETTE_PASTILLES = ['#B5452F', '#5452C8', '#3A3A62', '#1E7F6C', '#2D5BD1', '#D97A2B'] as const
const COULEUR_MOTIF = '#6B6B80'

/** Hôte d'une clé de règle (`www.` ignoré) ; '' si la clé n'en a pas. */
function hoteDe(cle: string): string {
  const c = cleDe(cle)
  if (!c) return ''
  let hote = c.valeur
  if (c.type === 'origine') {
    try {
      hote = c.valeur === 'file://' ? 'file' : new URL(c.valeur).hostname
    } catch {
      hote = ''
    }
  }
  return hote.replace(/^www\./, '')
}

/** Empreinte stable (djb2) : même hôte, même couleur, d'une session à l'autre. */
function empreinte(texte: string): number {
  let h = 5381
  for (let i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) >>> 0
  return h
}

/** Pastille d'un site : première lettre de l'hôte sur une couleur déterministe ; un motif `*.hôte` a un « * » gris. */
export function pastille(cle: string): { lettre: string; couleur: string } {
  if (cleDe(cle)?.type === 'motif') return { lettre: '*', couleur: COULEUR_MOTIF }
  const hote = hoteDe(cle)
  return { lettre: (hote[0] ?? '?').toUpperCase(), couleur: PALETTE_PASTILLES[empreinte(hote) % PALETTE_PASTILLES.length] }
}

/**
 * Route profonde d'une règle : `#/sites/<origine encodée>` (l'origine contient `//` et un port possible, or `routeDepuisHash`
 * découpe sur `/`) ; suffixe `/style` : le détail s'ouvre sur l'éditeur « Style personnalisé ».
 */
export const encoderRoute = (cle: string, style = false): string => `#/sites/${encodeURIComponent(cle)}${style ? '/style' : ''}`

/** Clé canonique de la règle visée par un hash `#/sites/<…>[/style]` ; `null` si le hash ne vise aucun site valide. */
export function decoderRoute(hash: string): { cle: string; style: boolean } | null {
  const [section, brut, suffixe] = hash.replace(/^#\/?/, '').split('/')
  if (section !== 'sites' || !brut) return null
  let decode: string
  try {
    decode = decodeURIComponent(brut)
  } catch {
    return null
  }
  const cle = cleCanonique(decode)
  return cle ? { cle, style: suffixe === 'style' } : null
}

/** Marque une cellule comme héritée (valeur absente de la règle de la ligne mais fournie par une autre règle). */
export const heritee = (c: Cellule, oui: boolean): Cellule => (oui ? { ...c, herite: true } : c)

/** Champs d'une règle que le tableau et le détail affichent avec héritage. */
export type ChampHerite = 'boucliers' | 'cookies' | 'scripts' | 'zoom' | 'exceptionDnd' | 'lectureAuto' | 'ua' | 'style' | 'scriptsPerso' | 'scriptletsYoutube'

/** URL qui représente le site d'une clé de règle, pour interroger `resoudre` (hôte nu → https ; motif → un sous-domaine). */
export function urlDeCle(cle: string): string {
  const c = cleDe(cle)
  if (!c) return ''
  if (c.type === 'origine') return c.valeur === 'file://' ? 'file:///' : c.valeur
  return c.type === 'motif' ? `https://sous.${c.valeur}` : `https://${c.valeur}`
}

/** Règle effective du site d'une clé, avec (`avec`) ou sans (`sans`) la règle enregistrée de cette clé. */
export function effective(sites: Record<string, RegleSite>, cle: string): RegleEffective {
  return resoudre(sites, urlDeCle(cle))
}
export function heritage(sites: Record<string, RegleSite>, cle: string): RegleEffective {
  const { [cle]: _propre, ...autres } = sites
  return resoudre(autres, urlDeCle(cle))
}

/** Vrai si le champ vient d'ailleurs que de la règle de la ligne. */
export const vientDHeritage = (propre: RegleSite | undefined, eff: RegleSite, champ: ChampHerite): boolean =>
  (propre?.[champ] === undefined || propre?.[champ] === null) && eff[champ] !== undefined

/**
 * Politique d'écriture : choisir la valeur que la règle aurait sans son propre champ (héritée, sinon par défaut) retire le champ (`null`),
 * toute autre valeur est écrite telle quelle.
 */
export const valeurAEcrire = <T>(choisie: T, parDefaut: T): T | null => (choisie === parDefaut ? null : choisie)

/** Règle écrite à la création : le niveau de Boucliers déjà en vigueur sur le site (un motif `*.` Strict reste Strict). */
export function regleInitiale(sites: Record<string, RegleSite>, cle: string): RegleSite {
  return { boucliers: effective(sites, cle).boucliers }
}

/** Saisie du champ « Nouvelle règle » : une URL complète est ramenée à son origine ; le reste est inchangé. */
export function siteDeSaisie(saisie: string): string {
  const t = saisie.trim()
  if (!/^https?:\/\//i.test(t)) return t
  try {
    const u = new URL(t)
    return u.origin === 'null' ? t : u.origin
  } catch {
    return t
  }
}

/** Premier « Script n » dont le nom n'est pas déjà pris. */
export function nomScriptLibre(noms: string[]): string {
  const pris = new Set(noms)
  let n = 1
  while (pris.has(`Script ${n}`)) n++
  return `Script ${n}`
}

/** Vrai si une autre règle (motif `*.hôte`, hôte, origine) qui couvre ce site fixe les Boucliers (`resoudre` ne distingue pas ce cas du défaut). */
export function boucliersHerites(sites: Record<string, RegleSite>, cle: string): boolean {
  const cible = cleDe(cle)
  if (!cible || cle === 'file://') return false
  let url: URL
  try {
    url = new URL(urlDeCle(cle))
  } catch {
    return false
  }
  const hote = url.hostname
  for (const [k, r] of Object.entries(sites)) {
    if (k === cle || r.boucliers === undefined) continue
    const c = cleDe(k)
    if (!c) continue
    if (c.type === 'motif' && hote.endsWith(`.${c.valeur}`)) return true
    if (cible.type === 'motif') continue
    if (c.type === 'hote' && cible.type === 'origine' && c.valeur === hote) return true
  }
  return false
}
