import type { WebContents } from 'electron'
import type { ExtensionInstallee, InfoExtension, ResultatInstallation } from '../../shared/types'
import { handle } from '../ipc'
import type { Evenements } from '../../shared/ipc'
import { collecterStubs, type Journal, type PageExtension } from './journal'
import type { Chargeur } from './chargeur'
import { analyserSourceChrome, type InstallateurChrome } from './chrome'
import { analyserSourceFirefox, installateurFirefoxParId, type InstallateurFirefox } from './firefox'
import { consommerFile } from './fileImport'
import type { InstallateursParId } from './file'
import type { MiseAJour } from './miseAJour'
import { ID_EXTENSION } from './registre'
import { porteeDuManifest, urlOptions } from './details'

export interface OptionsIpcExtensions {
  chargeur: Chargeur
  installateur: InstallateurChrome
  firefox: InstallateurFirefox
  miseAJour: MiseAJour
  journal: Journal
  /** Pages `chrome-extension://` ouvertes (arrière-plan, popup, options) : source du comptage des API stubées. */
  pagesExtension: () => PageExtension[]
  /** Sélecteur natif (fichier .crx/.zip/.xpi ou dossier) ; undefined si l'utilisateur annule. */
  choisir: (sender: WebContents, quoi: 'fichier' | 'dossier') => Promise<string | undefined>
  /** L'expéditeur est-il dans une fenêtre privée ? (jamais d'installation depuis une fenêtre privée) */
  estPrivee: (sender: WebContents) => boolean
  /** Manifest de l'extension installée (undefined si illisible). */
  lireManifest: (e: ExtensionInstallee) => Record<string, unknown> | undefined
  /** Ouvre une page de l'extension dans une nouvelle étoile de la fenêtre de l'expéditeur. */
  ouvrirEtoile: (sender: WebContents, url: string) => void
  /** Écrit `settings.sites[origine].extensions[id]`. */
  ecrireRegleSite: (origine: string, id: string, active: boolean) => void
  /** Envoie un évènement de la file d'import aux pages internes (lyra://) et à l'interface. */
  diffuser: <K extends 'extensions:progressionFile' | 'extensions:finFile'>(canal: K, data: Evenements[K]) => void
  /** Installateurs simulés de la file d'import (e2e sous `LYRA_TEST` : aucun accès réseau). */
  installateursFileTest?: InstallateursParId
  /** `LYRA_TEST=1` : un chemin de fichier ou de dossier peut être passé directement en `source`. */
  modeTest: boolean
}

/** IPC `extensions:*` : l'expéditeur est vérifié par `handle` ; l'identifiant est validé avant tout usage. */
export function installerExtensionsIpc(o: OptionsIpcExtensions): void {
  const { chargeur } = o
  const info = (e: ExtensionInstallee & { chargee: boolean }): InfoExtension => {
    const manifest = o.lireManifest(e)
    const { dossier: _dossier, ...publique } = e
    return { ...publique, aOptions: !!manifest && urlOptions(e.id, manifest) !== undefined, portee: manifest ? porteeDuManifest(manifest) : { tous: false, hotes: [] } }
  }
  handle('extensions:lister', () => chargeur.lister().map(info))
  handle('extensions:options', (d, e) => {
    if (!d || typeof d.id !== 'string' || !ID_EXTENSION.test(d.id)) return false
    const ext = chargeur.lister().find((x) => x.id === d.id)
    const manifest = ext && o.lireManifest(ext)
    const url = manifest ? urlOptions(d.id, manifest) : undefined
    if (!ext || !ext.chargee || !url || o.estPrivee(e.sender)) return false
    o.ouvrirEtoile(e.sender, url)
    return true
  })
  handle('extensions:regleSite', (d) => {
    if (!d || typeof d.id !== 'string' || !ID_EXTENSION.test(d.id) || typeof d.active !== 'boolean' || typeof d.origine !== 'string') return false
    if (!/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(d.origine) || d.origine.length > 300) return false
    if (!chargeur.lister().some((x) => x.id === d.id)) return false
    o.ecrireRegleSite(d.origine, d.id, d.active)
    return true
  })
  handle('extensions:activer', async (d) => {
    if (!d || typeof d.id !== 'string' || !ID_EXTENSION.test(d.id) || typeof d.active !== 'boolean') return false
    return chargeur.activer(d.id, d.active)
  })
  handle('extensions:desinstaller', async (d) => {
    if (!d || typeof d.id !== 'string' || !ID_EXTENSION.test(d.id)) return false
    const ok = await chargeur.desinstaller(d.id)
    if (ok) o.journal.supprimer(d.id)
    return ok
  })
  handle('extensions:journal', async (d) => {
    if (!d || typeof d.id !== 'string' || !ID_EXTENSION.test(d.id)) return undefined
    await collecterStubs({ journal: o.journal, pages: o.pagesExtension }, d.id)
    return o.journal.lire(d.id)
  })
  handle('extensions:installer', async (d, e): Promise<ResultatInstallation> => {
    if (o.estPrivee(e.sender)) return { etat: 'erreur', raison: "Les extensions ne s'installent pas depuis une fenêtre privée." }
    let source: string | undefined
    if (d?.choisir === 'fichier' || d?.choisir === 'dossier') {
      source = await o.choisir(e.sender, d.choisir)
      if (!source) return { etat: 'erreur', raison: 'Aucun fichier choisi.' }
    } else if (typeof d?.source === 'string') {
      source = d.source
    }
    if (!source) return { etat: 'erreur', raison: 'Aucune source indiquée.' }
    const f = analyserSourceFirefox(source)
    // Un .xpi est testé avant tout (un chemin absolu serait pris pour un dossier) ; ensuite Chrome (identifiant, Web Store,
    // .crx/.zip/dossier), puis AMO (nom, slug, identifiant gecko, adresse).
    const firefox = f?.type === 'xpi' || (f !== undefined && !analyserSourceChrome(source))
    // Un chemin local ne vient que du sélecteur natif (côté main) ; seul le mode test l'accepte tel quel.
    if (!d?.choisir && !o.modeTest) {
      const a = analyserSourceChrome(source)
      if (f?.type === 'xpi' || (a && (a.type === 'crx' || a.type === 'zip' || a.type === 'dossier'))) {
        return { etat: 'erreur', raison: 'Choisis le fichier ou le dossier avec le sélecteur.' }
      }
    }
    return firefox ? o.firefox.installerFirefox(source) : o.installateur.installerChrome(source)
  })
  // File d'import (jalon E) : l'appelant fournit la file et réécrit `restantes` ; jamais depuis une fenêtre privée.
  let fileEnCours = false
  handle('extensions:consommerFile', async (d, e) => {
    if (o.estPrivee(e.sender)) throw new Error("Les extensions ne s'installent pas depuis une fenêtre privée.")
    if (!d || !Array.isArray(d.entrees) || d.entrees.length > 200) throw new Error('File invalide.')
    if (fileEnCours) throw new Error("Une file d'import est déjà en cours.")
    const magasins = ['chrome', 'edge', 'firefox', 'inconnu']
    const entrees = d.entrees.filter(
      (x) => x && typeof x.id === 'string' && x.id.length <= 200 && typeof x.nom === 'string' && magasins.includes(x.magasin)
    ).map((x) => ({
      id: x.id,
      nom: x.nom.slice(0, 120),
      magasin: x.magasin,
      ...(typeof x.actif === 'boolean' ? { actif: x.actif } : {}),
      ...(x.imposee === true ? { imposee: true } : {})
    }))
    const confirmees = new Set(Array.isArray(d.confirmees) ? d.confirmees.filter((i): i is string => typeof i === 'string') : [])
    fileEnCours = true
    try {
      const r = await consommerFile(entrees, {
        installateurs: o.installateursFileTest ?? { chrome: (id) => o.installateur.installerChrome(id), firefox: installateurFirefoxParId(o.firefox) },
        confirmees,
        desactiver: (id) => chargeur.activer(id, false),
        surProgression: (p) =>
          o.diffuser('extensions:progressionFile', {
            index: p.index,
            total: p.total,
            nom: p.entree.nom,
            ...(p.resultat ? { etat: p.resultat.etat === 'choix' ? 'manuel' : p.resultat.etat, ...(p.resultat.etat === 'installee' ? {} : { raison: p.resultat.raison }) } : {})
          })
      })
      o.diffuser('extensions:finFile', r)
      return r
    } finally {
      fileEnCours = false
    }
  })
  handle('extensions:majTout', async () => o.miseAJour.verifier())
}
