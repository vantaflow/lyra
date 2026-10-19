import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { ENGINE_VERSION } from '@ghostery/adblocker'
import type { ListesEmbarquees } from './listes'

export type SourceMoteur = 'cache' | 'embarque' | 'reseau'

export interface OptionsMoteur {
  cacheDir: string
  listesEmbarquees?: ListesEmbarquees
  listesDistantes: string[]
  fetch?: typeof fetch
  maintenant?: Date
  majHeures: number
}

export interface ResultatMoteur {
  moteur: ElectronBlocker
  source: SourceMoteur
  date: string
}

export const CONFIG_MOTEUR = {
  loadCosmeticFilters: true,
  loadNetworkFilters: true,
  enableCompression: false,
  enableInMemoryCache: true
}

const FICHIER_BIN = 'engine.bin'
const FICHIER_META = 'engine.meta.json'

function lireCache(opts: OptionsMoteur, maintenant: Date): Promise<ResultatMoteur | undefined> {
  return (async () => {
    try {
      const meta = JSON.parse(await readFile(join(opts.cacheDir, FICHIER_META), 'utf8')) as {
        date: string
        engineVersion: number
      }
      const age = maintenant.getTime() - new Date(meta.date).getTime()
      if (meta.engineVersion !== ENGINE_VERSION || !(age < opts.majHeures * 3600_000)) return undefined
      const moteur = ElectronBlocker.deserialize(new Uint8Array(await readFile(join(opts.cacheDir, FICHIER_BIN))))
      return { moteur, source: 'cache' as const, date: meta.date }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[boucliers] cache illisible, reconstruction :', e)
      return undefined
    }
  })()
}

async function ecrireCache(cacheDir: string, moteur: ElectronBlocker, date: string): Promise<void> {
  try {
    await mkdir(cacheDir, { recursive: true })
    const bin = join(cacheDir, FICHIER_BIN)
    await writeFile(bin + '.tmp', moteur.serialize())
    await rename(bin + '.tmp', bin)
    await writeFile(join(cacheDir, FICHIER_META), JSON.stringify({ date, engineVersion: ENGINE_VERSION }))
  } catch (e) {
    console.warn('[boucliers] écriture du cache impossible :', e)
  }
}

function construire(textes: string[], resources?: string): ElectronBlocker {
  const moteur = ElectronBlocker.parse(textes.join('\n'), CONFIG_MOTEUR)
  if (resources) moteur.updateResources(resources, String(resources.length))
  return moteur
}

async function depuisReseau(opts: OptionsMoteur, f: typeof fetch, maintenant: Date): Promise<ResultatMoteur> {
  const reponses = await Promise.allSettled(
    opts.listesDistantes.map(async (url) => {
      const r = await f(url)
      if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`)
      return r.text()
    })
  )
  const textes = reponses.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (textes.length === 0) throw new Error('aucune liste téléchargée')
  const moteur = construire(textes, opts.listesEmbarquees?.resources)
  const date = maintenant.toISOString()
  await ecrireCache(opts.cacheDir, moteur, date)
  return { moteur, source: 'reseau', date }
}

/** Réseau uniquement (jamais le cache), pour la mise à jour périodique. */
export async function mettreAJour(opts: OptionsMoteur): Promise<ResultatMoteur> {
  return depuisReseau(opts, opts.fetch ?? fetch, opts.maintenant ?? new Date())
}

/** Cache valide, sinon réseau, sinon listes embarquées. */
export async function construireMoteur(opts: OptionsMoteur): Promise<ResultatMoteur> {
  const maintenant = opts.maintenant ?? new Date()
  const cache = await lireCache(opts, maintenant)
  if (cache) return cache
  if (opts.fetch) {
    try {
      return await depuisReseau(opts, opts.fetch, maintenant)
    } catch (e) {
      console.warn('[boucliers] réseau indisponible, listes embarquées :', e)
    }
  }
  const emb = opts.listesEmbarquees
  if (!emb) throw new Error('[boucliers] ni cache, ni réseau, ni listes embarquées')
  const moteur = construire(emb.textes, emb.resources)
  await ecrireCache(opts.cacheDir, moteur, emb.date)
  return { moteur, source: 'embarque', date: emb.date }
}
