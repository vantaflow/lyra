import type { Settings } from '../../shared/types'
import { fusion } from './store'

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

type Obj = Record<string, unknown>
const estObjet = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const propre = (o: Obj, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined)

const enumeration = <T extends string>(...valeurs: T[]) => (v: unknown): T | undefined =>
  valeurs.find((x) => x === v)
const booleen = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
const entier = (min: number, max: number) => (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined
const texte = (max: number, motif?: RegExp) => (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= max && (!motif || motif.test(v)) ? v : undefined

/** Origine acceptée comme clé de règle de site : http(s)://hôte[:port] ou file://. */
const ORIGINE = /^(https?:\/\/([a-z0-9.-]+|\[[0-9a-f:]+\])(:\d{1,5})?|file:\/\/)$/i
const MAX_SITES = 10_000

/** sites : { origine: { boucliers?: boolean } } ; entrées invalides ignorées. */
function sites(v: unknown): Obj | undefined {
  if (!estObjet(v)) return undefined
  const sortie: Obj = {}
  let n = 0
  for (const [origine, regle] of Object.entries(v)) {
    if (n >= MAX_SITES) break
    if (origine.length > 300 || !ORIGINE.test(origine) || !estObjet(regle)) continue
    const boucliers = booleen(propre(regle, 'boucliers'))
    if (boucliers === undefined) continue
    sortie[origine] = { boucliers }
    n++
  }
  return Object.keys(sortie).length > 0 ? sortie : undefined
}

type Schema = { [k: string]: ((v: unknown) => unknown) | Schema }

const SCHEMA: Schema = {
  langue: texte(16, /^[A-Za-z]{2,3}([-_][A-Za-z0-9]+)?$/),
  theme: enumeration('systeme', 'clair', 'sombre'),
  moteurParDefaut: texte(100),
  moteurChoisi: booleen,
  ciel: {
    position: enumeration('gauche', 'droite', 'haut', 'bas'),
    largeur: entier(160, 640),
    masque: booleen,
    ternirApresMin: entier(1, 10080),
    endormirApresMin: entier(1, 10080)
  },
  boucliers: {
    niveau: enumeration('standard'),
    genes: booleen,
    majHeures: entier(1, 168)
  },
  telechargements: {
    dossier: texte(4096),
    demander: booleen
  },
  sites
}

function filtrer(brut: unknown, schema: Schema): Obj {
  const sortie: Obj = {}
  if (!estObjet(brut)) return sortie
  for (const [cle, regle] of Object.entries(schema)) {
    const v = propre(brut, cle)
    if (typeof regle === 'function') {
      const ok = regle(v)
      if (ok !== undefined) sortie[cle] = ok
    } else {
      const sous = filtrer(v, regle)
      if (Object.keys(sous).length > 0) sortie[cle] = sous
    }
  }
  return sortie
}

/** Ne garde que les clés connues, avec types et valeurs valides (liste blanche). */
export function validerPatch(brut: unknown): DeepPartial<Settings> {
  return filtrer(brut, SCHEMA) as DeepPartial<Settings>
}

/** Réglages complets : défauts + champs valides du JSON brut. */
export function validerSettings(brut: unknown, defauts: Settings): Settings {
  return fusion(defauts, validerPatch(brut))
}
