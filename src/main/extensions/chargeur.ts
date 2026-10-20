/** Chargement des extensions du registre dans la session : au démarrage, à chaud (activer) et à la désinstallation. */
import { randomUUID } from 'node:crypto'
import { readdir, rename, rm } from 'node:fs/promises'
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
  /** Ferme les pages ouvertes de l'extension (options…) juste avant son retrait de la session ; une exception est journalisée. */
  avantRetrait?: (idElectron: string) => void | Promise<void>
}

export interface ResultatChargement {
  id: string
  ok: boolean
  erreur?: string
}

export interface Chargeur {
  /** Charge les extensions actives dans l'ordre d'installation ; une erreur est journalisée, jamais propagée. */
  chargerAuDemarrage(): Promise<ResultatChargement[]>
  /** Active ou désactive à chaud et met le registre à jour ; faux si inconnue ou si le chargement échoue. Sous le verrou de l'id. */
  activer(id: string, active: boolean): Promise<boolean>
  /** Retire l'extension de la session, supprime `<base>/<id>` et l'entrée du registre ; faux si inconnue. Sous le verrou de l'id. */
  desinstaller(id: string): Promise<boolean>
  /** Charge (ou recharge) une extension déjà inscrite au registre, par exemple juste après son installation. Sans verrou : à appeler sous `verrou(id)`. */
  charger(id: string): Promise<ResultatChargement>
  /** Retire l'extension de la session seulement (le registre garde son état « actif ») : retrait temporaire d'une installation. Sans verrou. */
  retirerSession(id: string): Promise<void>
  /**
   * Exécute `travail` quand les travaux précédents du même identifiant sont terminés (une chaîne de promesses par id) :
   * installation, mise à jour, activation et désinstallation d'une même extension ne s'entremêlent jamais. Une erreur ne bloque pas la suite.
   */
  verrou<T>(id: string, travail: () => Promise<T>): Promise<T>
  /** Retire puis recharge une extension chargée (règle par site modifiée) sous son verrou ; sans effet si elle n'est pas chargée. */
  recharger(id: string): Promise<ResultatChargement | undefined>
  lister(): Array<ExtensionInstallee & { chargee: boolean }>
}

/** Dossiers en cours de suppression (renommés avant `rm`) ; ceux qu'une interruption a laissés sont balayés au démarrage. */
const PREFIXE_SUPPRESSION = '.suppr-'

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
      await o.avantRetrait?.(idElectron)
    } catch (err) {
      journal(`${id} : fermeture des pages impossible — ${message(err)}`)
    }
    try {
      await o.extensions.removeExtension(idElectron)
    } catch (err) {
      journal(`${id} : retrait impossible — ${message(err)}`)
    }
  }

  const desinstallerSousVerrou = async (id: string): Promise<boolean> => {
    const e = o.registre.trouver(id)
    if (!e || !ID_EXTENSION.test(id)) return false
    await retirer(id)
    // Toutes les versions de l'extension : <base>/<id>. L'id est validé (32 lettres a-p) : aucune traversée possible.
    // Renommage d'abord (atomique : l'extension disparaît d'un coup, même si la suppression s'interrompt), suppression ensuite.
    const racine = resolve(o.base)
    const dossier = join(racine, id)
    const aSupprimer = join(racine, `${PREFIXE_SUPPRESSION}${id}-${randomUUID().slice(0, 8)}`)
    try {
      await rename(dossier, aSupprimer)
      await rm(aSupprimer, { recursive: true, force: true })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        /* rien à supprimer */
      } else {
        journal(`${id} : suppression du dossier impossible — ${message(err)}`)
        // Dernier recours : suppression directe du dossier d'origine s'il existe encore.
        await rm(dossier, { recursive: true, force: true }).catch(() => undefined)
      }
    }
    return o.registre.retirer(id)
  }

  const verrous = new Map<string, Promise<void>>()
  const verrou = <T>(idExt: string, travail: () => Promise<T>): Promise<T> => {
    const precedent = verrous.get(idExt) ?? Promise.resolve()
    const resultat = precedent.then(travail)
    const fin = resultat.then(
      () => undefined,
      () => undefined
    )
    verrous.set(idExt, fin)
    void fin.then(() => {
      if (verrous.get(idExt) === fin) verrous.delete(idExt)
    })
    return resultat
  }

  return {
    verrou,
    retirerSession: retirer,

    async chargerAuDemarrage() {
      const resultats: ResultatChargement[] = []
      try {
        for (const nom of await readdir(resolve(o.base))) {
          if (nom.startsWith(PREFIXE_SUPPRESSION)) await rm(join(resolve(o.base), nom), { recursive: true, force: true }).catch(() => undefined)
        }
      } catch {
        /* dossier de base absent : rien à balayer */
      }
      // En série : l'ordre d'installation est l'ordre de chargement.
      for (const e of o.registre.lister()) if (e.active) resultats.push(await charger(e))
      return resultats
    },

    activer: (id, active) =>
      verrou(id, async () => {
        const e = o.registre.trouver(id)
        if (!e) return false
        if (!active) {
          await retirer(id)
          return o.registre.activer(id, false)
        }
        const r = await charger(e)
        if (!r.ok) return false
        return o.registre.activer(id, true)
      }),

    desinstaller: (id) => verrou(id, () => desinstallerSousVerrou(id)),

    charger: async (id) => {
      const e = o.registre.trouver(id)
      return e ? charger(e) : { id, ok: false, erreur: 'extension inconnue' }
    },

    recharger: (id) =>
      verrou(id, async () => {
        const e = o.registre.trouver(id)
        if (!e || !e.active || !chargees.has(id)) return undefined
        await retirer(id)
        return charger(e)
      }),

    lister: () => o.registre.lister().map((e) => ({ ...e, chargee: chargees.has(e.id) }))
  }
}
