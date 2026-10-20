import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ListesEmbarquees {
  textes: string[]
  resources?: string
  date: string
  /** Adresses des listes texte (hors resources.json), pour la mise à jour réseau. */
  urls?: string[]
  /** Listes « gênes » (categorie: 'genes') : jamais mêlées aux listes de base, pour un moteur à part. */
  genes?: { textes: string[]; urls: string[] }
}

/** Dossier des listes embarquées en production (extraResources). */
export function dossierListesEmbarquees(): string {
  return join(process.resourcesPath ?? '.', 'resources/shields')
}

/** Lit LISTES.json puis chaque liste du dossier ; resources.json est traité à part. */
export async function chargerListesEmbarquees(dossier: string = dossierListesEmbarquees()): Promise<ListesEmbarquees> {
  const index = JSON.parse(await readFile(join(dossier, 'LISTES.json'), 'utf8')) as {
    date: string
    listes: { fichier: string; url?: string; categorie?: string }[]
  }
  const textes: string[] = []
  const urls: string[] = []
  const genes = { textes: [] as string[], urls: [] as string[] }
  let resources: string | undefined
  for (const l of index.listes) {
    const contenu = await readFile(join(dossier, l.fichier), 'utf8')
    if (l.fichier === 'resources.json') resources = contenu
    else {
      const cible = l.categorie === 'genes' ? genes : { textes, urls }
      cible.textes.push(contenu)
      if (l.url) cible.urls.push(l.url)
    }
  }
  return { textes, resources, date: index.date, urls, ...(genes.textes.length > 0 ? { genes } : {}) }
}
