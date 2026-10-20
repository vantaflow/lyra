import { MESSAGE_ERREUR_GENERIQUE, messageLisible } from '../../shared/messageTechnique'

/**
 * Message d'une erreur IPC à afficher : sans l'enrobage « Error invoking remote method … », et jamais un message
 * technique brut (JSON.parse, erreur système, IPC) : celui-ci devient `repli`, le détail part au journal.
 */
export function messageErreur(e: unknown, repli: string = MESSAGE_ERREUR_GENERIQUE): string {
  return messageLisible(e, repli)
}
