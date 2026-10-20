/** Lecture tolérante d'un `manifest.json` : BOM, commentaires `//` et `/* *​/` (hors chaînes) retirés avant `JSON.parse`. */
export function sansCommentairesJson(texte: string): string {
  const t = texte.replace(/^﻿/, '')
  let sortie = ''
  let i = 0
  while (i < t.length) {
    const c = t[i]
    if (c === '"') {
      let j = i + 1
      while (j < t.length && t[j] !== '"') j += t[j] === '\\' ? 2 : 1
      sortie += t.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && t[i + 1] === '/') {
      while (i < t.length && t[i] !== '\n') i++
    } else if (c === '/' && t[i + 1] === '*') {
      const fin = t.indexOf('*/', i + 2)
      i = fin === -1 ? t.length : fin + 2
    } else {
      sortie += c
      i++
    }
  }
  return sortie
}

export const lireJsonTolerant = (texte: string): unknown => JSON.parse(sansCommentairesJson(texte))
