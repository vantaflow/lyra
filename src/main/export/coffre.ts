/** Coffre du système pour la clé de la sauvegarde automatique : `safeStorage` d'Electron (Trousseau, DPAPI, libsecret). */
import { safeStorage } from 'electron'
import type { Coffre } from './sauvegardeAuto'

export function coffreSysteme(): Coffre {
  return {
    // Linux sans trousseau : « basic_text » ne protège rien, on refuse plutôt que de faire semblant.
    disponible: () => {
      try {
        if (!safeStorage.isEncryptionAvailable()) return false
        const fond = (safeStorage as unknown as { getSelectedStorageBackend?: () => string }).getSelectedStorageBackend?.()
        return fond !== 'basic_text' && fond !== 'unknown'
      } catch {
        return false
      }
    },
    chiffrer: (texte) => safeStorage.encryptString(texte),
    dechiffrer: (donnees) => safeStorage.decryptString(Buffer.from(donnees))
  }
}

/** Tests e2e (LYRA_TEST=1) uniquement : jamais d'accès au Trousseau du poste, aucune protection réelle. */
export const coffreDeTest: Coffre = {
  disponible: () => true,
  chiffrer: (texte) => Buffer.from(`test:${texte}`),
  dechiffrer: (donnees) => Buffer.from(donnees).toString().slice('test:'.length)
}
