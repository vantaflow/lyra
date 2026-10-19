import { handle } from '../ipc'
import type { Chargeur } from './chargeur'
import { ID_EXTENSION } from './registre'

/** IPC `extensions:*` : l'expéditeur est vérifié par `handle` ; l'identifiant est validé avant tout usage. */
export function installerExtensionsIpc(chargeur: Chargeur): void {
  handle('extensions:lister', () => chargeur.lister())
  handle('extensions:activer', async (d) => {
    if (!d || typeof d.id !== 'string' || !ID_EXTENSION.test(d.id) || typeof d.active !== 'boolean') return false
    return chargeur.activer(d.id, d.active)
  })
  handle('extensions:desinstaller', async (d) => {
    if (!d || typeof d.id !== 'string' || !ID_EXTENSION.test(d.id)) return false
    return chargeur.desinstaller(d.id)
  })
}
