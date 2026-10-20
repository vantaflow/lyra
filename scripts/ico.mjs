// Assemblage d'un fichier .ico à partir d'images PNG (format ICO avec PNG embarqués, lu par Windows depuis Vista).
export const TAILLES_ICO = [16, 24, 32, 48, 64, 128, 256]
/** Jusqu'à cette taille, l'icône simplifiée (traits épais) remplace l'icône détaillée. */
export const TAILLE_MAX_PETITE = 48

/** `entrees` : [{ taille, png: Buffer }] ; renvoie le contenu du .ico. */
export function assemblerIco(entrees) {
  const entete = Buffer.alloc(6 + 16 * entrees.length)
  entete.writeUInt16LE(0, 0) // réservé
  entete.writeUInt16LE(1, 2) // type : icône
  entete.writeUInt16LE(entrees.length, 4)
  let decalage = entete.length
  entrees.forEach(({ taille, png }, i) => {
    const o = 6 + 16 * i
    entete.writeUInt8(taille >= 256 ? 0 : taille, o) // largeur (0 = 256)
    entete.writeUInt8(taille >= 256 ? 0 : taille, o + 1)
    entete.writeUInt8(0, o + 2) // couleurs de palette
    entete.writeUInt8(0, o + 3)
    entete.writeUInt16LE(1, o + 4) // plans
    entete.writeUInt16LE(32, o + 6) // bits par pixel
    entete.writeUInt32LE(png.length, o + 8)
    entete.writeUInt32LE(decalage, o + 12)
    decalage += png.length
  })
  return Buffer.concat([entete, ...entrees.map((e) => e.png)])
}
