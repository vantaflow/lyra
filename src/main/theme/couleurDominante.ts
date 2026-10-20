/**
 * Couleur dominante d'une image (favicon) : pixels BGRA (ordre de `nativeImage.toBitmap()`), regroupés par 16 niveaux par canal ;
 * les pixels transparents, presque blancs, presque noirs ou gris sont ignorés (ils ne donnent pas de teinte). `null` s'il n'en reste aucun.
 */
export function couleurDominante(bgra: Uint8Array): string | null {
  const seaux = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i + 3 < bgra.length; i += 4) {
    const [b, g, r, a] = [bgra[i], bgra[i + 1], bgra[i + 2], bgra[i + 3]]
    if (a < 128) continue
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max < 40 || min > 225 || (max - min) / max < 0.2) continue
    const cle = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const seau = seaux.get(cle) ?? { n: 0, r: 0, g: 0, b: 0 }
    seau.n++
    seau.r += r
    seau.g += g
    seau.b += b
    seaux.set(cle, seau)
  }
  let meilleur: { n: number; r: number; g: number; b: number } | undefined
  for (const s of seaux.values()) if (!meilleur || s.n > meilleur.n) meilleur = s
  if (!meilleur) return null
  const c = (somme: number): string => Math.round(somme / meilleur!.n).toString(16).padStart(2, '0')
  return `#${c(meilleur.r)}${c(meilleur.g)}${c(meilleur.b)}`.toUpperCase()
}
