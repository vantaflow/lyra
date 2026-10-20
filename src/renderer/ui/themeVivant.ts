// Thème vivant des vues Lyra (interface, overlay, pages lyra://) : le processus principal diffuse les variables CSS du thème effectif
// (`theme:variables`), posées ici sur <html> sans rechargement. theme.css garde les valeurs d'Indigo nuit pour le premier rendu.
import { signal } from '@preact/signals'
import type { ThemeDiffuse } from '../../shared/ipc'

/** Incrémenté à chaque thème appliqué : les composants qui lisent une variable calculée s'y abonnent. */
export const versionTheme = signal(0)

/** Sous-ensemble de <html> utilisé (injectable en test). */
export interface RacineTheme {
  style: { setProperty(nom: string, valeur: string): void; removeProperty(nom: string): void }
  setAttribute(nom: string, valeur: string): void
}

const NOM_VARIABLE = /^--[a-z0-9-]+$/
/** Couleurs seulement : #hex ou rgb()/rgba() ; rien d'autre ne vient du canal (pas d'url(), pas de calc). */
const VALEUR_COULEUR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\))$/

/** Pose les variables du thème (celles du thème privé pour une vue privée) ; retire celles d'un thème précédent qui ont disparu. */
export function appliquerTheme(racine: RacineTheme, theme: ThemeDiffuse, privee: boolean, posees: Set<string>): void {
  const variables = privee ? theme.privee : theme.variables
  const suivantes = new Set<string>()
  for (const [nom, valeur] of Object.entries(variables)) {
    if (!NOM_VARIABLE.test(nom) || !VALEUR_COULEUR.test(valeur)) continue
    // Minuscules, comme les valeurs statiques de theme.css : même texte avant et après la diffusion.
    racine.style.setProperty(nom, valeur.toLowerCase())
    suivantes.add(nom)
  }
  for (const nom of posees) if (!suivantes.has(nom)) racine.style.removeProperty(nom)
  posees.clear()
  for (const nom of suivantes) posees.add(nom)
  racine.setAttribute('data-mode', theme.mode)
}

/** À appeler une fois par vue : rattrape le thème courant, puis suit `theme:variables` et le passage en vue privée. */
export function demarrerTheme(): void {
  const html = document.documentElement
  const posees = new Set<string>()
  let dernier: ThemeDiffuse | null = null
  const appliquer = (): void => {
    if (!dernier) return
    appliquerTheme(html, dernier, html.classList.contains('privee'), posees)
    versionTheme.value++
  }
  window.lyra.on('theme:variables', (t) => {
    dernier = t
    appliquer()
  })
  void window.lyra.invoke('theme:effectif').then(
    (t) => {
      dernier ??= t
      appliquer()
    },
    () => undefined
  )
  // La classe `privee` arrive parfois après le chargement (nouvel onglet, pages lyra://) : on rechoisit alors le jeu de variables.
  let etaitPrivee = html.classList.contains('privee')
  new MutationObserver(() => {
    const privee = html.classList.contains('privee')
    if (privee === etaitPrivee) return
    etaitPrivee = privee
    appliquer()
  }).observe(html, { attributes: true, attributeFilter: ['class'] })
  if (!etaitPrivee) {
    void window.lyra.invoke('fenetre:privee').then(
      (privee) => privee && html.classList.add('privee'),
      () => undefined
    )
  }
}
