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
  /** Délai d'attente par liste, en ms (15 000 par défaut). */
  timeoutMs?: number
  /** Préfixe des fichiers du cache (`engine` par défaut ; `engine-genes` pour le moteur des gênes). */
  nomCache?: string
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

const fichierBin = (opts: Pick<OptionsMoteur, 'nomCache'>): string => `${opts.nomCache ?? 'engine'}.bin`
const fichierMeta = (opts: Pick<OptionsMoteur, 'nomCache'>): string => `${opts.nomCache ?? 'engine'}.meta.json`

function lireCache(opts: OptionsMoteur, maintenant: Date, tolererPerime = false): Promise<ResultatMoteur | undefined> {
  return (async () => {
    try {
      const meta = JSON.parse(await readFile(join(opts.cacheDir, fichierMeta(opts)), 'utf8')) as {
        date: string
        engineVersion: number
      }
      const age = maintenant.getTime() - new Date(meta.date).getTime()
      if (meta.engineVersion !== ENGINE_VERSION || (!tolererPerime && !(age < opts.majHeures * 3600_000))) return undefined
      const moteur = ElectronBlocker.deserialize(new Uint8Array(await readFile(join(opts.cacheDir, fichierBin(opts)))))
      return { moteur, source: 'cache' as const, date: meta.date }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[boucliers] cache illisible, reconstruction :', e)
      return undefined
    }
  })()
}

async function ecrireCache(opts: Pick<OptionsMoteur, 'cacheDir' | 'nomCache'>, moteur: ElectronBlocker, date: string): Promise<void> {
  const cacheDir = opts.cacheDir
  try {
    await mkdir(cacheDir, { recursive: true })
    const bin = join(cacheDir, fichierBin(opts))
    await writeFile(bin + '.tmp', moteur.serialize())
    await rename(bin + '.tmp', bin)
    await writeFile(join(cacheDir, fichierMeta(opts)), JSON.stringify({ date, engineVersion: ENGINE_VERSION }))
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
      const r = await f(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) })
      if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`)
      return r.text()
    })
  )
  const echecs = reponses.filter((r) => r.status === 'rejected')
  if (echecs.length > 0 || reponses.length === 0) {
    throw new Error(`${echecs.length}/${reponses.length} liste(s) en échec : ${(echecs[0] as PromiseRejectedResult | undefined)?.reason}`)
  }
  const textes = reponses.map((r) => (r as PromiseFulfilledResult<string>).value)
  const moteur = construire(textes, opts.listesEmbarquees?.resources)
  const date = maintenant.toISOString()
  await ecrireCache(opts, moteur, date)
  return { moteur, source: 'reseau', date }
}

/**
 * Réseau uniquement, pour la mise à jour périodique. Si une liste échoue,
 * le moteur actuel est conservé et le cache n'est pas réécrit.
 */
export async function mettreAJour(opts: OptionsMoteur, actuel: ResultatMoteur): Promise<ResultatMoteur> {
  try {
    return await depuisReseau(opts, opts.fetch ?? fetch, opts.maintenant ?? new Date())
  } catch (e) {
    console.warn('[boucliers] mise à jour échouée, moteur conservé :', e)
    return actuel
  }
}

/** Cache valide, sinon réseau (si `fetch`), sinon cache périmé s'il est plus récent que les listes embarquées, sinon listes embarquées. */
export async function construireMoteur(opts: OptionsMoteur): Promise<ResultatMoteur> {
  const maintenant = opts.maintenant ?? new Date()
  const cache = await lireCache(opts, maintenant)
  if (cache) return cache
  if (opts.fetch) {
    try {
      return await depuisReseau(opts, opts.fetch, maintenant)
    } catch (e) {
      console.warn('[boucliers] réseau indisponible ou incomplet :', e)
    }
  }
  const emb = opts.listesEmbarquees
  // Sans réseau (ou au démarrage, sans fetch) : un cache périmé vaut mieux que des listes embarquées plus anciennes.
  const perime = await lireCache(opts, maintenant, true)
  if (perime && (!emb || perime.date >= emb.date)) return perime
  if (!emb) throw new Error('[boucliers] ni cache, ni réseau, ni listes embarquées')
  const moteur = construire(emb.textes, emb.resources)
  await ecrireCache(opts, moteur, emb.date)
  return { moteur, source: 'embarque', date: emb.date }
}
