import { versSymboles } from '../../shared/accelerateur'

/** Raccourcis du design (« ⌘ ⇧ N ») adaptés à la plateforme : Ctrl / Maj / Alt hors macOS. */
export function raccourci(texte: string, plateforme: string = window.lyra.plateforme): string {
  if (plateforme === 'darwin') return texte
  const nom: Record<string, string> = { '⌘': 'Ctrl', '⌃': 'Ctrl', '⇧': 'Maj', '⌥': 'Alt', '⇥': 'Tab', '↩': 'Entrée', '⎋': 'Échap', '⌫': 'Retour', '⌦': 'Suppr' }
  return texte
    .split(' ')
    .map((t) => nom[t] ?? t)
    .join('+')
}

/** Accélérateur Electron (`CmdOrCtrl+Shift+D`) tel qu'on l'affiche : « ⌘ ⇧ D » sur macOS, « Ctrl+Maj+D » ailleurs. */
export function afficherAccelerateur(accelerateur: string, plateforme: string = window.lyra.plateforme): string {
  return raccourci(versSymboles(accelerateur), plateforme)
}
