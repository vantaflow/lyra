/**
 * Canaux `import:*` (jalon E, 3.5) : page `lyra://settings` seulement, jamais une fenêtre privée. La logique vit dans
 * `Importeur` (sans Electron) ; ici, uniquement le contrôle de l'expéditeur et l'envoi des évènements à la page.
 * `import:fichier` reste réservé (Task 4).
 */
import type { WebContents } from 'electron'
import { envoyer, handle } from '../ipc'
import type { CiblesImport } from './appliquer'
import { Importeur, estPageReglages } from './importeur'
import type { Processus } from './processus'

export interface DepsImportIpc {
  processus: Processus
  estPrivee(wc: WebContents): boolean
  /** Magasins réels ; la fenêtre normale cible est choisie à partir de la page qui lance l'import. */
  cibles(wc: WebContents): CiblesImport
}

export function installerImportIpc(deps: DepsImportIpc): Importeur {
  const importeur = new Importeur(deps.processus)
  const controle = (e: { senderFrame?: { url: string; parent?: unknown } | null; sender: WebContents }, canal: string): void => {
    const url = e.senderFrame?.url ?? ''
    if (!estPageReglages(url) || e.senderFrame?.parent) throw new Error(`IPC refusé pour ${canal} depuis ${url}`)
    if (deps.estPrivee(e.sender)) throw new Error(`IPC refusé pour ${canal} depuis une fenêtre privée`)
  }

  handle('import:detecter', (_d, e) => {
    controle(e, 'import:detecter')
    return importeur.detecter()
  })
  handle('import:apercu', (d, e) => {
    controle(e, 'import:apercu')
    return importeur.apercu(d)
  })
  handle('import:lancer', async (d, e) => {
    // Fenêtre privée : refus typé, rien n'est lu ni écrit.
    if (!estPageReglages(e.senderFrame?.url ?? '') || e.senderFrame?.parent) throw new Error(`IPC refusé pour import:lancer depuis ${e.senderFrame?.url ?? ''}`)
    if (deps.estPrivee(e.sender)) return { erreur: 'prive' as const }
    const wc = e.sender
    return importeur.lancer(d, () => deps.cibles(wc), {
      progression: (p) => envoyer(wc, 'import:progression', p),
      termine: (id, resultat) => envoyer(wc, 'import:termine', { id, resultat })
    })
  })
  handle('import:annuler', (d, e) => {
    controle(e, 'import:annuler')
    if (typeof d?.id === 'string') importeur.annuler(d.id)
  })
  return importeur
}
