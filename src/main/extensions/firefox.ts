/**
 * Installation d'extensions Firefox : addons.mozilla.org (nom, slug, identifiant gecko ou adresse) ou fichier .xpi.
 * Le .xpi est extrait par l'extraction sûre de `archives.ts`, converti (`convertisseur.ts`) puis finalisé comme une extension
 * Chrome (registre + chargement, `convertie: true`). L'identité (clé du manifest) dérive de l'identifiant gecko : réinstaller
 * ou mettre à jour garde le même identifiant Chrome.
 */
import { createHash, createPublicKey } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RapportConversion, ResultatInstallation, SuggestionChrome } from '../../shared/types'
import { analyserSourceAmo, creerClientAmo, type InfosAmo, type SourceAmo } from './amo'
import { ErreurArchive, extraireZip } from './archives'
import { creerBaseInstallation, DELAI_RESEAU_MS, type DepsInstallateurChrome } from './chrome'
import { convertir } from './convertisseur'
import { requeteSure } from './reseau'

export { DELAI_RESEAU_MS }

// ------------------------------------------------------------------------------------------------- analyse

export type SourceFirefox = { type: 'xpi' } | { type: 'amo'; amo: SourceAmo }

const CHEMIN_ABSOLU = /^(\/|~[\\/]|[A-Za-z]:[\\/])/

/** Fichier .xpi (chemin) ou source AMO ; undefined si ce n'est rien de pris en charge. */
export function analyserSourceFirefox(texte: string): SourceFirefox | undefined {
  const t = texte.trim()
  if (t.length === 0 || t.length > 2000) return undefined
  if (/\.xpi$/i.test(t) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return CHEMIN_ABSOLU.test(t) ? { type: 'xpi' } : undefined
  const amo = analyserSourceAmo(t)
  return amo ? { type: 'amo', amo } : undefined
}

// ------------------------------------------------------------------------------------------------- suggestions Chrome

interface Equivalent {
  chrome: string
  nom: string
  guid: string[]
}

/** Extensions dont l'auteur publie aussi un build Chrome : l'installation Chrome est préférable. */
const EQUIVALENTS_CHROME: Equivalent[] = [
  { chrome: 'cjpalhdlnbpafiamejdnhcphjbkeiagm', nom: 'uBlock Origin', guid: ['ublock0@raymondhill.net'] },
  { chrome: 'eimadpbcbfnmbkopoojfekhnkhdbieeh', nom: 'Dark Reader', guid: ['addon@darkreader.org'] },
  { chrome: 'nngceckbapebfimnlniiiahkandclblb', nom: 'Bitwarden', guid: ['{446900e4-71c2-419f-a6a7-df9c091e268b}'] },
  { chrome: 'gebbhagfogifgggkldgodflihgfeippi', nom: 'Return YouTube Dislike', guid: ['{762f9885-5a13-4abd-9c77-433dcd38b8fd}'] },
  { chrome: 'mnjggcdmjocbbbhaepdhchncahnbgone', nom: 'SponsorBlock', guid: ['sponsorblocker@ajay.app'] },
  { chrome: 'pkehgijcmpdhfbdbbnkijodmdjhbjlgp', nom: 'Privacy Badger', guid: ['jid1-mnnxcxisbpnsxq@jetpack'] }
]

const normaliser = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Version Chrome connue de la même extension (identifiant gecko, sinon nom), sinon undefined. */
export function suggestionChrome(guid: string | undefined, nom: string): SuggestionChrome | undefined {
  const e = EQUIVALENTS_CHROME.find((x) => (guid && x.guid.includes(guid.toLowerCase())) || normaliser(x.nom) === normaliser(nom))
  return e ? { id: e.chrome, nom: e.nom } : undefined
}

// ------------------------------------------------------------------------------------------------- identité

/**
 * Clé publique RSA (DER, base64) déterminée par `graine` : module fabriqué à partir de sha256(graine), exposant 65537.
 * Chromium ne dérive que l'identifiant de la clé (sha256) et ne cherche pas la clé privée : l'id est stable d'une
 * installation à l'autre et d'une machine à l'autre.
 */
export function cleDepuisGraine(graine: string): string {
  const n = Buffer.concat(Array.from({ length: 8 }, (_, i) => createHash('sha256').update(`lyra-firefox:${i}:${graine}`).digest()))
  n[0] |= 0x80
  n[n.length - 1] |= 1
  const cle = createPublicKey({ key: { kty: 'RSA', n: n.toString('base64url'), e: 'AQAB' }, format: 'jwk' })
  return cle.export({ type: 'spki', format: 'der' }).toString('base64')
}

// ------------------------------------------------------------------------------------------------- installateur

export interface DepsInstallateurFirefox extends DepsInstallateurChrome {
  /** Chemin de `browser-polyfill.js` (webextension-polyfill 0.12.0 embarqué). */
  polyfill: string
  /** Conversion d'une icône SVG en PNG (Electron) ; absent, les icônes SVG sont retirées avec un avertissement. */
  svgVersPng?: (svg: Buffer, taille: number) => Promise<Buffer | undefined>
  /** `userData/extensions/cache` (par défaut `<base>/cache`). */
  cache?: string
}

export interface InstallateurFirefox {
  /** AMO (nom, slug, identifiant gecko, adresse) ou chemin d'un .xpi. Ne lève jamais. */
  installerFirefox(source: string): Promise<ResultatInstallation>
  /** Version la plus récente sur AMO (undefined : inconnue). */
  versionDistanteAmo(slug: string): Promise<string | undefined>
  /** Retélécharge, reconvertit et réinstalle (mêmes bornes, sha256, signature d'identité). */
  mettreAJourAmo(slug: string): Promise<ResultatInstallation>
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function creerInstallateurFirefox(d: DepsInstallateurFirefox): InstallateurFirefox {
  const base = creerBaseInstallation(d)
  const { echec, enAttente, finaliser, lireFichier } = base
  const amo = creerClientAmo({
    requete: (url, accepte, max, tolere404) => requeteSure({ fetch: base.f, delaiMs: d.delaiMs ?? DELAI_RESEAU_MS }, url, accepte, max, undefined, tolere404),
    cache: d.cache ?? join(d.base, 'cache')
  })

  /** Extrait, convertit, finalise. Le dossier d'attente disparaît quoi qu'il arrive. */
  function convertirEtInstaller(xpi: Uint8Array, o: { source: 'amo' | 'xpi'; slugAmo?: string }): Promise<ResultatInstallation> {
    return enAttente(async (attente) => {
      extraireZip(xpi, attente)
      let guid: string | undefined
      let nomBrut = ''
      try {
        const m = JSON.parse(readFileSync(join(attente, 'manifest.json'), 'utf8').replace(/^﻿/, '').replace(/^\s*\/\/.*$/gm, '')) as Record<string, unknown>
        const gecko = (m.browser_specific_settings ?? m.applications) as { gecko?: { id?: unknown } } | undefined
        if (typeof gecko?.gecko?.id === 'string' && gecko.gecko.id) guid = gecko.gecko.id
        nomBrut = typeof m.name === 'string' ? m.name : ''
      } catch {
        /* la conversion rapporte « manifest.json illisible » */
      }
      const cle = cleDepuisGraine(guid ?? `nom:${nomBrut}`)
      const { rapport } = await convertir(attente, { enTete: [{ nom: 'browser-polyfill.js', source: d.polyfill }], svgVersPng: d.svgVersPng, cle })
      const suggestion = suggestionChrome(guid, nomBrut)
      if (rapport.refus) {
        d.journal?.(`conversion refusée : ${rapport.refus}`)
        return { etat: 'erreur', raison: rapport.refus, rapport, ...(suggestion ? { suggestionChrome: suggestion } : {}) }
      }
      // Le rapport voyage avec le dossier de la version (supprimé avec elle, lu par le journal de compatibilité).
      writeFileSync(join(attente, 'lyra-conversion.json'), JSON.stringify(rapport, null, 2))
      const r = await finaliser({ extrait: attente, source: o.source, magasin: 'firefox', convertie: true, ...(o.slugAmo ? { slugAmo: o.slugAmo } : {}) })
      if (r.etat !== 'installee') return r
      return { ...r, convertie: true, rapport: rapport as RapportConversion, ...(suggestion ? { suggestionChrome: suggestion } : {}) }
    })
  }

  async function depuisAmo(source: SourceAmo, forcer: boolean): Promise<ResultatInstallation> {
    const infos: InfosAmo = await amo.resoudre(source)
    const deja = d.registre.lister().find((e) => e.slugAmo === infos.slug)
    if (!forcer && deja && deja.version === infos.version) return { etat: 'installee', id: deja.id, nom: deja.nom, version: deja.version, convertie: true }
    const xpi = await amo.telecharger(infos)
    return convertirEtInstaller(xpi, { source: 'amo', slugAmo: infos.slug })
  }

  async function installerFirefox(source: string): Promise<ResultatInstallation> {
    const a = analyserSourceFirefox(source)
    if (!a) return echec('source non reconnue : nom, adresse addons.mozilla.org ou fichier .xpi')
    try {
      if (a.type === 'xpi') return await convertirEtInstaller(lireFichier(source.trim()), { source: 'xpi' })
      return await depuisAmo(a.amo, false)
    } catch (e) {
      return echec(e instanceof ErreurArchive ? e.message : `installation impossible : ${message(e)}`)
    }
  }

  return {
    installerFirefox,
    versionDistanteAmo: async (slug) => (await amo.resoudre({ type: 'slug', slug })).version,
    mettreAJourAmo: (slug) => depuisAmo({ type: 'slug', slug }, true).catch((e) => echec(`mise à jour impossible : ${message(e)}`))
  }
}
