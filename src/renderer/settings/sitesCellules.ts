/** « Règles par site » : valeurs → cellules du tableau, pastille et route profonde (ParametresSites.dc.html). Module pur. */
import type { RegleSite } from '../../shared/types'
import { cleCanonique, cleDe } from '../../main/settings/sites'

export type Teinte = 'vert' | 'rouge' | 'violet'
/** Contenu d'une cellule : texte brut, ou étiquette colorée quand `teinte` est présente. */
export interface Cellule {
  texte: string
  teinte?: Teinte
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
