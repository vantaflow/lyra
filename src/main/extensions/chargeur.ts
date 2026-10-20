/** Chargement des extensions du registre dans la session : au démarrage, à chaud (activer) et à la désinstallation. */
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ExtensionInstallee } from '../../shared/types'
import { dossierAbsolu, ID_EXTENSION, type Registre } from './registre'

/** Ce que le chargeur utilise de `session.extensions` (Electron ≥ 35) ; simulable en test. */
export interface SessionExtensions {
  loadExtension(chemin: string, options?: { allowFileAccess?: boolean }): Promise<{ id: string; name?: string }>
  removeExtension(id: string): void | Promise<void>
  getAllExtensions(): Array<{ id: string; name?: string }>
}

export interface OptionsChargeur {
  extensions: SessionExtensions
  registre: Registre
  /** `userData/extensions` : racine de tous les dossiers d'extensions. */
  base: string
  journal?: (message: string) => void
  /** Appelé juste avant `loadExtension` (stubs MV2 si le marqueur manque) ; une exception est journalisée, jamais propagée. */
  avantChargement?: (e: ExtensionInstallee, dossier: string) => void
  /** Appelé après un chargement réussi (journal de compatibilité) ; une exception est journalisée, jamais propagée. */
  apresChargement?: (e: ExtensionInstallee, dossier: string) => void
}

export interface ResultatChargement {
  id: string
  ok: boolean
  erreur?: string
}

export interface Chargeur {
  /** Charge les extensions actives dans l'ordre d'installation ; une erreur est journalisée, jamais propagée. */
  chargerAuDemarrage(): Promise<ResultatChargement[]>
  /** Active ou désactive à chaud et met le registre à jour ; faux si inconnue ou si le chargement échoue. */
  activer(id: string, active: boolean): Promise<boolean>
  /** Retire l'extension de la session, supprime `<base>/<id>` et l'entrée du registre ; faux si inconnue. */
  desinstaller(id: string): Promise<boolean>
  /** Charge (ou recharge) une extension déjà inscrite au registre, par exemple juste après son installation. */
  charger(id: string): Promise<ResultatChargement>
  lister(): Array<ExtensionInstallee & { chargee: boolean }>
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function creerChargeur(o: OptionsChargeur): Chargeur {
  const journal = o.journal ?? ((m: string) => console.warn(`[extensions] ${m}`))
  /** id du registre → id attribué par Electron (identiques sauf extension sans clé déplacée). */
  const chargees = new Map<string, string>()

  const charger = async (e: ExtensionInstallee): Promise<ResultatChargement> => {
    if (chargees.has(e.id)) return { id: e.id, ok: true }
    try {
      const chemin = dossierAbsolu(o.base, e.dossier)
      try {
        o.avantChargement?.(e, chemin)
      } catch (err) {
        journal(`${e.id} (${e.nom}) : préparation impossible — ${message(err)}`)
      }
      const chargee = await o.extensions.loadExtension(chemin, { allowFileAccess: false })
      if (chargee.id !== e.id) journal(`${e.id} (${e.nom}) : Electron lui a attribué l'identifiant ${chargee.id}`)
      chargees.set(e.id, chargee.id)
      try {
        o.apresChargement?.(e, chemin)
      } catch (err) {
        journal(`${e.id} (${e.nom}) : journal de compatibilité impossible — ${message(err)}`)
      }
      return { id: e.id, ok: true }
    } catch (err) {
      const erreur = message(err)
      journal(`${e.id} (${e.nom}) : chargement impossible — ${erreur}`)
      return { id: e.id, ok: false, erreur }
    }
  }

  const retirer = async (id: string): Promise<void> => {
    const idElectron = chargees.get(id)
    if (idElectron === undefined) return
    chargees.delete(id)
    try {
      await o.extensions.removeExtension(idElectron)
    } catch (err) {
      journal(`${id} : retrait impossible — ${message(err)}`)
    }
  }

  return {
    async chargerAuDemarrage() {
      const resultats: ResultatChargement[] = []
      // En série : l'ordre d'installation est l'ordre de chargement.
      for (const e of o.registre.lister()) if (e.active) resultats.push(await charger(e))
      return resultats
    },

    async activer(id, active) {
      const e = o.registre.trouver(id)
      if (!e) return false
      if (!active) {
        await retirer(id)
        return o.registre.activer(id, false)
      }
      const r = await charger(e)
      if (!r.ok) return false
      return o.registre.activer(id, true)
    },

    async desinstaller(id) {
      const e = o.registre.trouver(id)
      if (!e || !ID_EXTENSION.test(id)) return false
      await retirer(id)
      // Toutes les versions de l'extension : <base>/<id>. L'id est validé (32 lettres a-p) : aucune traversée possible.
      const racine = resolve(o.base)
      const dossier = join(racine, id)
      try {
        await rm(dossier, { recursive: true, force: true })
      } catch (err) {
        journal(`${id} : suppression du dossier impossible — ${message(err)}`)
      }
      return o.registre.retirer(id)
    },

    charger: async (id) => {
      const e = o.registre.trouver(id)
      return e ? charger(e) : { id, ok: false, erreur: 'extension inconnue' }
    },

    lister: () => o.registre.lister().map((e) => ({ ...e, chargee: chargees.has(e.id) }))
  }
}
