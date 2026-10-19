import fr from './fr.json'
import en from './en.json'

type Dictionnaire = Record<string, string>

const dictionnaires: Record<string, Dictionnaire> = { fr, en }
const LANGUE_REPLI = 'fr'

/**
 * Fournisseur de la langue système. Dans le renderer : navigator.language.
 * Le processus principal le remplace par app.getLocale() au démarrage.
 */
let fournisseur: () => string = () =>
  typeof navigator !== 'undefined' ? navigator.language : LANGUE_REPLI

export function definirFournisseurLangue(f: () => string): void {
  fournisseur = f
}

export function langueActive(): string {
  const code = (fournisseur() || '').toLowerCase().split(/[-_]/)[0]
  return code in dictionnaires ? code : LANGUE_REPLI
}

export function t(key: string, vars?: Record<string, string>): string {
  const dico = dictionnaires[langueActive()]
  const modele = dico[key] ?? dictionnaires[LANGUE_REPLI][key] ?? key
  if (!vars) return modele
  return modele.replace(/\{(\w+)\}/g, (m, nom: string) => vars[nom] ?? m)
}
