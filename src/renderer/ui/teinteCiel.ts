// « Le ciel prend la teinte du site actif » et « Chaque constellation a sa couleur » : calculs purs, appliqués en variables CSS.
import type { EtatEtoile } from '../../shared/ipc'
import { etiquetteTeinteSite, rgbaDe } from '../../shared/themes'

const HEX = /^#[0-9A-Fa-f]{6}$/

/** Variables locales d'une constellation : l'étoile active, ses halos et les lignes prennent sa couleur. `undefined` : style du thème. */
export function styleConstellation(couleur: string, actif: boolean): Record<string, string> | undefined {
  if (!actif || !HEX.test(couleur)) return undefined
  return { '--etoile-active': couleur, '--lignes': couleur, '--halo-etoile': rgbaDe(couleur, 0.7), '--halo-anneau': rgbaDe(couleur, 0.22) }
}

/** Couleur du site : `theme-color` de la page active, à défaut la couleur dominante de son favicon (déjà en cache). */
export function couleurDuSite(etat: EtatEtoile | undefined): string | null {
  for (const c of [etat?.couleur, etat?.teinteFavicon]) if (c && HEX.test(c)) return c
  return null
}

/** Fond du ciel teinté (18 % de la couleur du site) ; `undefined` : réglage désactivé ou site sans couleur. */
export function teinteDuCiel(cielBase: string, etat: EtatEtoile | undefined, actif: boolean): string | undefined {
  const site = actif ? couleurDuSite(etat) : null
  return site ? etiquetteTeinteSite(cielBase, site).toLowerCase() : undefined
}
