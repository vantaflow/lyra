/** Logique du canal `sites:*`, sans Electron (testable) ; `installer.ts` la branche sur l'IPC. */
import type { RegleSite, Settings } from '../../shared/types'
import { cleCanonique } from '../settings/sites'
import type { Reglages } from '../settings/settings'

/** Vue interne de Lyra (pages `lyra://` et interface) : seule destinataire des règles de site (styles et scripts perso). */
export const estVueInterne = (url: string, dev: string | undefined = process.env.ELECTRON_RENDERER_URL): boolean =>
  url.startsWith('lyra://') || (url.includes('ui.html') && (url.startsWith('file://') || (!!dev && url.startsWith(dev))))

export interface Vue {
  getURL(): string
}

export interface DepsService<V extends Vue> {
  reglages: Reglages
  estPrivee(v: V): boolean
  vues(): Iterable<V>
  envoyer(v: V, regles: Record<string, RegleSite>): void
  /** Adresse d'une vue Lyra (défaut : `estVueInterne`) ; l'installateur fournit le contrôle strict de `ipc.ts`. */
  estVue?(url: string): boolean
}

/** Les réglages autres que `sites` ont-ils changé ? (`settings:changed` ne repart que dans ce cas.) */
export function reglagesHorsSitesChanges(avant: Settings, apres: Settings): boolean {
  return (Object.keys(apres) as Array<keyof Settings>).some((k) => k !== 'sites' && apres[k] !== avant[k])
}

export function creerServiceSites<V extends Vue>(deps: DepsService<V>) {
  const { reglages } = deps
  let precedent = reglages.getSettings().sites
  const desabonner = reglages.onChanged((s) => {
    if (s.sites === precedent) return
    precedent = s.sites
    for (const v of deps.vues()) if ((deps.estVue ?? estVueInterne)(v.getURL())) deps.envoyer(v, s.sites)
  })
  return {
    desabonner,
    lister: (): Record<string, RegleSite> => reglages.getSettings().sites,
    /** Crée ou fusionne ; un champ à `null` est retiré de la règle. Ignoré en fenêtre privée ou si la clé est invalide. */
    ecrire(d: { cle: string; regle: Record<string, unknown> }, emetteur: V): void {
      if (deps.estPrivee(emetteur)) return
      const cle = typeof d?.cle === 'string' ? cleCanonique(d.cle) : null
      if (!cle || typeof d.regle !== 'object' || d.regle === null || Array.isArray(d.regle)) return
      const retirer = Object.keys(d.regle).filter((k) => d.regle[k] === null)
      const ecrire = Object.fromEntries(Object.entries(d.regle).filter(([, v]) => v !== null))
      // Une seule écriture : une seule diffusion `sites:changed` (jamais d'état intermédiaire sans le champ retiré ni le nouveau).
      if (retirer.length || Object.keys(ecrire).length) reglages.modifierSite(cle, ecrire, retirer)
    },
    supprimer(cle: string, emetteur: V): void {
      if (deps.estPrivee(emetteur)) return
      const c = typeof cle === 'string' ? cleCanonique(cle) : null
      if (c && Object.hasOwn(reglages.getSettings().sites, c)) reglages.supprimerSite(c)
    }
  }
}
