import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ListesEmbarquees {
  textes: string[]
  resources?: string
  date: string
}

/** Dossier des listes embarquées en production (extraResources). */
export function dossierListesEmbarquees(): string {
  return join(process.resourcesPath ?? '.', 'resources/shields')
}

/** Lit LISTES.json puis chaque liste du dossier ; resources.json est traité à part. */
export async function chargerListesEmbarquees(dossier: string = dossierListesEmbarquees()): Promise<ListesEmbarquees> {
  const index = JSON.parse(await readFile(join(dossier, 'LISTES.json'), 'utf8')) as {
    date: string
    listes: { fichier: string }[]
  }
  const textes: string[] = []
  let resources: string | undefined
  for (const l of index.listes) {
    const contenu = await readFile(join(dossier, l.fichier), 'utf8')
    if (l.fichier === 'resources.json') resources = contenu
    else textes.push(contenu)
  }
  return { textes, resources, date: index.date }
}
