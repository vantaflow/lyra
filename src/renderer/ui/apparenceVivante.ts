// Variables d'apparence (police, taille, densité, coins) posées sur <html> d'une vue Lyra et tenues à jour par `settings:changed`.
import type { Settings } from '../../shared/types'
import { variablesApparence } from '../../shared/apparence'

export function appliquerApparence(a: Settings['apparence']): void {
  for (const [nom, valeur] of Object.entries(variablesApparence(a))) document.documentElement.style.setProperty(nom, valeur)
}

/** Vue sans état de ciel (overlay : palette, panneaux) : suit seulement l'apparence. */
export function suivreApparence(): void {
  window.lyra.on('settings:changed', (s) => appliquerApparence(s.apparence))
  void window.lyra.invoke('settings:get').then((s) => appliquerApparence(s.apparence))
}
