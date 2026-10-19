/** IPC des passerelles (expéditeur vérifié par `handle`). */
import { handle } from '../ipc'
import type { PasserellePerso } from '../../shared/types'
import type { Passerelles } from './Passerelles'

const texte = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 300) : '')

export function installerPasserellesIpc(p: Passerelles): void {
  handle('passerelles:etat', () => p.etat())
  handle('passerelles:ajouter', (d) => p.ajouter(texte(d?.hote)))
  handle('passerelles:retirer', (d) => p.retirer(texte(d?.hote)))
  handle('passerelles:basculerSite', (d) => p.basculerSite(texte(d?.hote)))
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
