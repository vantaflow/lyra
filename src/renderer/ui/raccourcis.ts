/** Raccourcis du design (« ⌘ ⇧ N ») adaptés à la plateforme : Ctrl / Maj / Alt hors macOS. */
export function raccourci(texte: string, plateforme: string = window.lyra.plateforme): string {
  if (plateforme === 'darwin') return texte
  return texte
    .split(' ')
    .map((t) => ({ '⌘': 'Ctrl', '⇧': 'Maj', '⌥': 'Alt' })[t] ?? t)
    .join('+')
}
