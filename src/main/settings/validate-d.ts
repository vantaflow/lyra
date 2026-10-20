/** Valideurs du jalon D (schéma v2) : blocs de réglages et champs de règle de site. */
import { HEURE_VALIDE } from '../../shared/heure-sombre'
import { CLES_COULEUR, COULEURS_INDIGO_NUIT, NOMS_THEMES } from '../../shared/types-reglages'

export type Obj = Record<string, unknown>
export type Validateur = (v: unknown) => unknown
export type Schema = { [k: string]: Validateur | Schema }

export const estObjet = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
export const propre = (o: Obj, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined)

export const enumeration = <T extends string>(...valeurs: T[]) => (v: unknown): T | undefined =>
  valeurs.find((x) => x === v)
export const booleen = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
export const entier = (min: number, max: number) => (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined
/** Entier strict (pixels) : une largeur de 250,5 est refusée. */
export const pixels = (min: number, max: number) => (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined
export const texte = (max: number, motif?: RegExp) => (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= max && (!motif || motif.test(v)) ? v : undefined
/** Comme `texte`, mais la chaîne vide est permise. */
const chaine = (max: number, motif?: RegExp) => (v: unknown): string | undefined =>
  typeof v === 'string' && v.length <= max && (!motif || motif.test(v)) ? v : undefined

const MAX_OCTETS = 100 * 1024
const MAX_SCRIPTS = 50
const MAX_RACCOURCIS = 200
const MAX_LABO = 100
const HEX = /^#[0-9a-fA-F]{6}$/

/** Texte de 100 Ko (UTF-8) au plus, vide permis. */
function code(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > MAX_OCTETS) return undefined
  return v.length * 3 <= MAX_OCTETS || new TextEncoder().encode(v).length <= MAX_OCTETS ? v : undefined
}

/** [{ nom, code, actif }] : 50 au plus, invalides ignorés ; `[]` explicite accepté, liste entièrement invalide ignorée. */
export function scriptsPerso(v: unknown): unknown[] | undefined {
  if (!Array.isArray(v)) return undefined
  const sortie: Obj[] = []
  for (const e of v) {
    if (sortie.length >= MAX_SCRIPTS) break
    if (!estObjet(e)) continue
    const nom = texte(100)(propre(e, 'nom'))
    const c = code(propre(e, 'code'))
    const actif = booleen(propre(e, 'actif'))
    if (nom === undefined || c === undefined || actif === undefined) continue
    sortie.push({ nom, code: c, actif })
  }
  return v.length > 0 && sortie.length === 0 ? undefined : sortie
}

const nomTheme = enumeration(...NOMS_THEMES)

/**
 * { élément: { clair, sombre } } en #RRGGBB ; null : pas de thème perso.
 * Une clé (ou un mode) absente est complétée par « Indigo nuit » ; une clé inconnue ou une valeur invalide rejette tout l'objet.
 */
function personnalisees(v: unknown): Obj | null | undefined {
  if (v === null) return null
  if (!estObjet(v)) return undefined
  if (Object.keys(v).some((k) => !(CLES_COULEUR as readonly string[]).includes(k))) return undefined
  const sortie: Obj = {}
  for (const cle of CLES_COULEUR) {
    const c = propre(v, cle)
    if (c !== undefined && !estObjet(c)) return undefined
    const [clair, sombre] = (['clair', 'sombre'] as const).map((mode) => {
      const x = c === undefined ? undefined : propre(c, mode)
      return x === undefined ? COULEURS_INDIGO_NUIT[cle][mode] : x
    })
    if (typeof clair !== 'string' || !HEX.test(clair) || typeof sombre !== 'string' || !HEX.test(sombre)) return undefined
    if (c !== undefined && Object.keys(c).some((k) => k !== 'clair' && k !== 'sombre')) return undefined
    sortie[cle] = { clair, sombre }
  }
  return sortie
}

/** Commande → accélérateur (64 caractères au plus, sans contrôle, vide = défaut) ; 200 entrées au plus. */
function raccourcis(v: unknown): Obj | undefined {
  if (!estObjet(v)) return undefined
  const sortie: Obj = {}
  for (const [cle, valeur] of Object.entries(v)) {
    if (Object.keys(sortie).length >= MAX_RACCOURCIS) break
    if (texte(64, /^[\w.:-]+$/)(cle) === undefined) continue
    const a = chaine(64, /^[^\u0000-\u001f]*$/)(valeur)
    if (a !== undefined) sortie[cle] = a
  }
  return Object.keys(v).length > 0 && Object.keys(sortie).length === 0 ? undefined : sortie
}

/** Interrupteurs expérimentaux : clé → booléen. */
function labo(v: unknown): Obj | undefined {
  if (!estObjet(v)) return undefined
  const sortie: Obj = {}
  for (const [cle, valeur] of Object.entries(v)) {
    if (Object.keys(sortie).length >= MAX_LABO) break
    if (texte(64, /^[\w-]+$/)(cle) !== undefined && typeof valeur === 'boolean') sortie[cle] = valeur
  }
  return Object.keys(v).length > 0 && Object.keys(sortie).length === 0 ? undefined : sortie
}

const boucliersSite = (v: unknown): boolean | 'desactives' | 'standard' | 'strict' | undefined =>
  booleen(v) ?? enumeration('desactives', 'standard', 'strict')(v)

/** Champs d'une règle de site valides (dont `boucliers`, booléen ou tri-état) ; le reste est ignoré. */
export function champsRegleSiteD(regle: Obj): Obj {
  const champs: Obj = {}
  const valideurs: Schema = {
    boucliers: boucliersSite,
    scriptletsYoutube: booleen,
    bouclierAvant: enumeration('standard', 'strict'),
    cookies: enumeration('tous', 'premiere-partie', 'bloques', 'session'),
    scripts: enumeration('autorises', 'bloques'),
    lectureAuto: enumeration('autoriser', 'sans-son', 'bloquer'),
    ua: texte(64),
    style: code,
    scriptsPerso
  }
  for (const [cle, valide] of Object.entries(valideurs) as [string, Validateur][]) {
    const ok = valide(propre(regle, cle))
    if (ok !== undefined) champs[cle] = ok
  }
  return champs
}

/** Blocs de réglages du jalon D, à étaler dans le schéma principal. */
export const SCHEMA_D: Schema = {
  apparence: {
    relierEnfants: booleen,
    iconesSites: booleen,
    archiverApresJours: (v) => (v === null ? null : pixels(1, 3650)(v)),
    nouvelleEtoile: enumeration('sous-active', 'fin-constellation', 'hors-constellation'),
    regrouperParSite: booleen,
    police: texte(100),
    tailleTexte: pixels(11, 17),
    densite: enumeration('confortable', 'compacte'),
    coinsArrondis: booleen,
    capsuleAuto: booleen
  },
  couleurs: {
    actif: nomTheme,
    privee: nomTheme,
    passage: enumeration('systeme', 'coucher', 'heure', 'jamais'),
    heureSombre: texte(5, HEURE_VALIDE),
    heureClair: texte(5, HEURE_VALIDE),
    personnalisees,
    depart: nomTheme,
    reference: personnalisees,
    corrigerContraste: booleen,
    cielTeinteParSite: booleen,
    couleurParConstellation: booleen,
    prefersColorScheme: booleen
  },
  palette: { suggestionsHistorique: booleen, suggestionsFavoris: booleen, suggestionsEnPrivee: booleen },
  confidentialite: { effacerHistorique: booleen, effacerCookies: booleen, effacerCache: booleen },
  raccourcis,
  gestes: { defilementHorizontal: booleen, clicMolette: booleen, molettePlusCmdZoom: booleen },
  dnd: { duree: (v) => (v === 30 || v === 60 || v === 'arret' ? v : undefined) },
  demarrage: {
    restaurer: booleen,
    pageAccueil: chaine(2048),
    nouvelleFenetre: enumeration('accueil', 'session', 'vide')
  },
  styles: { css: code, scripts: scriptsPerso },
  labo
}
