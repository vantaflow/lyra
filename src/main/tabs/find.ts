/** Recherche dans la page : findInPage / found-in-page d'une vue, résultats relayés à la capsule. */
import type { WebContents } from 'electron'

/** Lance ou poursuit la recherche ; texte vide : efface. */
export function rechercher(wc: WebContents, texte: string, o: { suivant?: boolean; precedent?: boolean } = {}): void {
  if (wc.isDestroyed()) return
  if (!texte) return arreter(wc)
  if (o.suivant || o.precedent) wc.findInPage(texte, { forward: !o.precedent, findNext: true })
  else wc.findInPage(texte)
}

export function arreter(wc: WebContents): void {
  if (!wc.isDestroyed()) wc.stopFindInPage('clearSelection')
}

/** Relaie chaque mise à jour de `found-in-page` ; `total` seulement quand le compte est définitif. */
export function relayerResultats(wc: WebContents, surResultat: (r: { actif: number; total: number }) => void): void {
  wc.on('found-in-page', (_e, r) => {
    if (r.finalUpdate) surResultat({ actif: r.activeMatchOrdinal, total: r.matches })
  })
}
