// « Le ciel prend la teinte du site actif » et « Chaque constellation a sa couleur » : calculs purs, appliqués en variables CSS.
import type { EtatEtoile } from '../../shared/ipc'
import { corriger, rapport } from '../../shared/contraste'
import { etiquetteTeinteSite, rgbaDe } from '../../shared/themes'

const HEX = /^#[0-9A-Fa-f]{6}$/

/** Contraste minimal d'une constellation sur le ciel (composant d'interface : étoile active, halos, lignes). */
const SEUIL_CONSTELLATION = 3

/** Variables locales d'une constellation : l'étoile active, ses halos et les lignes prennent sa couleur, ramenée à 3:1 sur le ciel. `undefined` : style du thème. */
export function styleConstellation(couleur: string, actif: boolean, ciel?: string): Record<string, string> | undefined {
  if (!actif || !HEX.test(couleur)) return undefined
  const c = ciel && HEX.test(ciel) ? corriger(couleur.toUpperCase(), ciel, SEUIL_CONSTELLATION) : couleur
  return { '--etoile-active': c, '--lignes': c, '--halo-etoile': rgbaDe(c, 0.7), '--halo-anneau': rgbaDe(c, 0.22) }
}

/** Couleur du site : `theme-color` de la page active, à défaut la couleur dominante de son favicon (déjà en cache). */
export function couleurDuSite(etat: EtatEtoile | undefined): string | null {
  for (const c of [etat?.couleur, etat?.teinteFavicon]) if (c && HEX.test(c)) return c
  return null
}

/** Parts essayées, de la plus forte (18 %) à la plus discrète. */
const PARTS_TEINTE = [18, 14, 10, 6, 3]
/** Textes du ciel revérifiés sur le ciel teinté : variable → contraste minimal. */
const TEXTES_DU_CIEL: ReadonlyArray<readonly [string, number]> = [
  ['--ciel-texte', 4.5], ['--etoiles', 4.5], ['--bouclier-ciel', 4.5], ['--libelles-ciel', 3], ['--libelles-groupe', 3]
]

/**
 * Fond du ciel teinté par le site : 18 % de sa couleur, ramenés par pas tant que les textes du ciel ne restent pas lisibles
 * (4,5:1 pour texte, étoiles, Boucliers ; 3:1 pour les libellés). Aucune part ne convient, réglage désactivé, fenêtre privée
 * (le ciel privé reste celui du thème privé) ou site sans couleur : `undefined`. `variables` : thème appliqué à la vue.
 */
export function teinteDuCiel(variables: Readonly<Record<string, string>>, etat: EtatEtoile | undefined, options: { actif: boolean; privee: boolean }): string | undefined {
  const site = options.actif && !options.privee ? couleurDuSite(etat) : null
  const base = variables['--ciel']
  if (!site || !base || !HEX.test(base)) return undefined
  for (const part of PARTS_TEINTE) {
    const teinte = etiquetteTeinteSite(base, site, part)
    const lisible = TEXTES_DU_CIEL.every(([nom, seuil]) => !HEX.test(variables[nom] ?? '') || rapport(variables[nom], teinte) >= seuil)
    if (lisible) return teinte.toLowerCase()
  }
  return undefined
}

/**
 * Lisse une valeur qui peut changer vite (`theme-color` d'une page) : au plus un changement affiché par `delaiMs` ;
 * pendant le délai la dernière valeur demandée est gardée puis appliquée. Une page ne peut donc pas faire clignoter le ciel.
 */
export function creerLisseur<T>(
  appliquer: (valeur: T) => void,
  delaiMs = 1000,
  maintenant: () => number = Date.now,
  planifier: (fn: () => void, ms: number) => unknown = setTimeout
): (cible: T) => void {
  let courante: T | undefined
  let demarre = false
  let dernierChangement = 0
  let attente: { valeur: T } | null = null
  let armee = false
  const poser = (valeur: T): void => {
    courante = valeur
    demarre = true
    dernierChangement = maintenant()
    appliquer(valeur)
  }
  return (cible) => {
    if (demarre && cible === courante && !attente) return
    const ecoule = maintenant() - dernierChangement
    if (!demarre || ecoule >= delaiMs) {
      attente = null
      if (!demarre || cible !== courante) poser(cible)
      return
    }
    attente = { valeur: cible }
    if (armee) return
    armee = true
    planifier(() => {
      armee = false
      const a = attente
      attente = null
      if (a && a.valeur !== courante) poser(a.valeur)
    }, delaiMs - ecoule)
  }
}
