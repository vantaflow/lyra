/** IPC des passerelles (expéditeur vérifié par `handle`). */
import { handle } from '../ipc'
import type { WebContents } from 'electron'
import type { PasserellePerso } from '../../shared/types'
import type { EtatPasserelles, Passerelles } from './Passerelles'

const texte = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 300) : '')

/** `estPrivee` : l'expéditeur appartient-il à une fenêtre privée ? Elle ne doit jamais écrire dans les réglages. */
export function installerPasserellesIpc(p: Passerelles, estPrivee: (wc: WebContents) => boolean): void {
  // Une modification ne répond qu'une fois le PAC en place : la navigation qui suit n'est pas interrompue par la
  // fermeture des connexions. Fenêtre privée : appel refusé, l'état est renvoyé sans rien écrire.
  const modifier = async (wc: WebContents, fn: () => EtatPasserelles): Promise<EtatPasserelles> => {
    if (estPrivee(wc)) return p.etat()
    const etat = fn()
    await p.pacApplique()
    return etat
  }
  handle('passerelles:etat', () => p.etat())
  handle('passerelles:ajouter', (d, e) => modifier(e.sender, () => p.ajouter(texte(d?.hote))))
  handle('passerelles:retirer', (d) => p.retirer(texte(d?.hote)))
  handle('passerelles:basculerSite', (d, e) => modifier(e.sender, () => p.basculerSite(texte(d?.hote))))
  handle('passerelles:tester', () => p.tester())
  handle('passerelles:personnelle', (d) => {
    const config = d?.config
    if (config === null) return p.definirPersonnelle(null)
    if (typeof config !== 'object' || config === undefined) throw new Error('Passerelle personnelle invalide')
    // Copie des seuls champs attendus ; la validation (liste blanche) est faite par l'orchestration.
    const { type, hote, port } = config as PasserellePerso
    return p.definirPersonnelle({ type, hote, port })
  })
  handle('passerelles:warp', () => p.warp())
}
