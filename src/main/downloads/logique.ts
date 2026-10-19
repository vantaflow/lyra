/** Logique pure des téléchargements (sans Electron, testable seule). */
import { basename, dirname, extname, join } from 'node:path'
import type { DownloadInfo } from '../../shared/types'

/**
 * Premier nom libre dans `dossier` : `fichier.txt`, puis `fichier (2).txt`, `fichier (3).txt`…
 * `existe` est injecté (fs.existsSync en production). Seul le dernier segment du nom est retenu.
 */
export function nomUnique(dossier: string, nom: string, existe: (chemin: string) => boolean): string {
  const propre = basename(nom.replace(/\\/g, '/')) || 'telechargement'
  if (!existe(join(dossier, propre))) return propre
  const ext = extname(propre)
  const racine = ext ? propre.slice(0, -ext.length) : propre
  for (let i = 2; ; i++) {
    const candidat = `${racine} (${i})${ext}`
    if (!existe(join(dossier, candidat))) return candidat
  }
}

export type EvenementTelechargement =
  | { type: 'updated'; recu: number; total: number; pause: boolean; interrompu: boolean; dtMs: number }
  | { type: 'done'; resultat: 'completed' | 'cancelled' | 'interrupted'; recu: number; total: number }

const FINAUX = new Set<DownloadInfo['etat']>(['termine', 'annule', 'erreur'])

/** Réduit un évènement `updated` / `done` d'Electron en nouvel état ; un état final ne change plus. */
export function reduire(info: DownloadInfo, ev: EvenementTelechargement): DownloadInfo {
  if (FINAUX.has(info.etat)) return info
  if (ev.type === 'done') {
    const { vitesse: _v, ...reste } = info
    if (ev.resultat === 'completed') return { ...reste, etat: 'termine', recu: ev.total > 0 ? ev.total : ev.recu, total: ev.total > 0 ? ev.total : ev.recu }
    return { ...reste, etat: ev.resultat === 'cancelled' ? 'annule' : 'erreur', recu: ev.recu, total: ev.total }
  }
  const { vitesse: _v, ...reste } = info
  if (ev.interrompu) return { ...reste, etat: 'erreur', recu: ev.recu, total: ev.total }
  if (ev.pause) return { ...reste, etat: 'pause', recu: ev.recu, total: ev.total }
  const vitesse = ev.dtMs > 0 ? Math.max(0, Math.round(((ev.recu - info.recu) * 1000) / ev.dtMs)) : undefined
  return { ...reste, etat: 'en-cours', recu: ev.recu, total: ev.total, ...(vitesse !== undefined ? { vitesse } : {}) }
}

/** Dossier parent d'un chemin (pour « Afficher »). */
export const dossierDe = (chemin: string): string => dirname(chemin)
