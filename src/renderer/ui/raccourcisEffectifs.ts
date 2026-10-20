import { signal } from '@preact/signals'
import { commandeParId, defautDe, redefinissable, tableEffective } from '../../shared/commandes'
import { afficherAccelerateur } from './raccourcis'

/**
 * Raccourcis effectifs des commandes de Lyra, tels que l'interface les affiche (menu ⋯, ciel, bande, rail, palette) :
 * `Settings.raccourcis` (écarts à la table par défaut) résolu par `tableEffective`, donc ce que le menu d'application
 * et `raccourciPage` appliquent vraiment. Une redéfinition se voit partout sans recharger.
 */

/** `Settings.raccourcis` courant ; relu à chaque `settings:changed` (voir `suivreRaccourcis`). */
export const raccourcisPerso = signal<Record<string, string>>({})

/** Raccourci effectif de la commande (« ⌘ ⇧ D » sur macOS, « Ctrl+Maj+D » ailleurs) ; vide si la commande est inconnue. */
export function aideCommande(id: string, table: Record<string, string>, plateforme: string): string {
  const c = commandeParId(id)
  if (!c) return ''
  const accelerateur = redefinissable(c, plateforme) ? tableEffective(table, plateforme)[id] : defautDe(c, plateforme)
  return accelerateur ? afficherAccelerateur(accelerateur, plateforme) : ''
}

/** Commandes de la palette (`main/palette/suggest.ts`) qui portent un raccourci redéfinissable. */
const COMMANDE_DE_LA_PALETTE: Record<string, string> = {
  'nouvelle-etoile': 'nouvelleEtoile',
  'fenetre-privee': 'fenetrePrivee',
  reglages: 'reglages',
  'dnd-60': 'dnd'
}

/** Sous-titre d'une ligne de la palette : le raccourci effectif de sa commande, sinon le sous-titre fourni (« Échap », « réglage »). */
export function aideSuggestion(s: { id?: string; sousTitre?: string }, table: Record<string, string>, plateforme: string): string {
  const commande = s.id === undefined ? undefined : COMMANDE_DE_LA_PALETTE[s.id]
  return commande ? aideCommande(commande, table, plateforme) : (s.sousTitre ?? '')
}

/**
 * Raccourci d'une commande pour le rendu : lit `raccourcisPerso` (signal), donc le composant se redessine quand
 * l'utilisateur redéfinit la combinaison.
 */
export const raccourciDe = (id: string): string => aideCommande(id, raccourcisPerso.value, window.lyra.plateforme)

/** Version « info-bulle » (« Replier le ciel (⌘ \ ) ») : le raccourci entre parenthèses, ou rien. */
export const entreParentheses = (id: string): string => {
  const a = raccourciDe(id)
  return a ? ` (${a})` : ''
}

export const sousTitrePalette = (s: { id?: string; sousTitre?: string }): string => aideSuggestion(s, raccourcisPerso.value, window.lyra.plateforme)

let suivi = false
/** Suit `Settings.raccourcis` dans cette vue (chrome ou overlay) ; sans effet au deuxième appel. */
export function suivreRaccourcis(): void {
  if (suivi) return
  suivi = true
  window.lyra.on('settings:changed', (s) => (raccourcisPerso.value = s.raccourcis ?? {}))
  void window.lyra.invoke('settings:get').then((s) => (raccourcisPerso.value = s.raccourcis ?? {}))
}
