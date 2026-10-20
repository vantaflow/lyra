import type { WebContents } from 'electron'
import type { ResultatInstallation } from '../../shared/types'
import { handle } from '../ipc'
import { collecterStubs, type Journal, type PageExtension } from './journal'
import type { Chargeur } from './chargeur'
import { analyserSourceChrome, type InstallateurChrome } from './chrome'
import { analyserSourceFirefox, type InstallateurFirefox } from './firefox'
import type { MiseAJour } from './miseAJour'
import { ID_EXTENSION } from './registre'

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
  /** `LYRA_TEST=1` : un chemin de fichier ou de dossier peut être passé directement en `source`. */
  modeTest: boolean
}

/** IPC `extensions:*` : l'expéditeur est vérifié par `handle` ; l'identifiant est validé avant tout usage. */
export function installerExtensionsIpc(o: OptionsIpcExtensions): void {
  const { chargeur } = o
  handle('extensions:lister', () => chargeur.lister())
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
  handle('extensions:majTout', async () => o.miseAJour.verifier())
}
