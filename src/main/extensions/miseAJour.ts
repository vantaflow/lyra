/**
 * Mises à jour des extensions : au démarrage puis toutes les 6 h (réglage `extensions.majAuto`) et à la demande.
 * Extensions du Chrome Web Store (`source === 'cws'`, actives ou non) : version annoncée par l'endpoint de mise à jour de Google
 * comparée à la version installée, puis réinstallation par le chemin normal de Lyra ; uBlock Origin : version de la dernière
 * release GitHub. Sans Electron (tout est injecté).
 */
import type { ResultatInstallation } from '../../shared/types'
import type { Registre, StoreReglages } from './registre'

export const INTERVALLE_MAJ_MS = 6 * 3600_000

export interface ResultatVerification {
  misesAJour: Array<{ id: string; nom: string; de: string; vers: string }>
  erreurs: string[]
  /** Date ISO posée dans les réglages (absente si une erreur est survenue). */
  derniereVerification?: string
}

export interface OptionsMiseAJour {
  registre: Registre
  reglages: StoreReglages
  /** Version la plus récente au Chrome Web Store (undefined : rien d'annoncé). */
  versionDistanteCws: (id: string) => Promise<string | undefined>
  /** Réinstalle depuis le Chrome Web Store. */
  mettreAJourCws: (id: string) => Promise<ResultatInstallation>
  derniereVersionUbo?: () => Promise<string>
  installerUbo?: () => Promise<ResultatInstallation>
  maintenant?: () => Date
  journal?: (m: string) => void
  /** Délai avant la première vérification après `demarrer` (0 par défaut). */
  delaiDemarrageMs?: number
}

export interface MiseAJour {
  verifier(): Promise<ResultatVerification>
  /** Première vérification puis une toutes les 6 h ; chaque échéance ne fait rien si `majAuto` est désactivé. */
  demarrer(): void
  arreter(): void
}

/** Compare deux versions numériquement, segment par segment (`1.0.0_0` = `1.0.0`). */
export function comparerVersions(a: string, b: string): number {
  const nb = (v: string): number[] => v.split(/[^0-9]+/).filter(Boolean).map(Number)
  const x = nb(a)
  const y = nb(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

export const estUbo = (e: { nom: string; source: string }): boolean => e.source === 'zip' && e.nom.trim().toLowerCase() === 'ublock origin'

export function creerMiseAJour(o: OptionsMiseAJour): MiseAJour {
  const maintenant = o.maintenant ?? ((): Date => new Date())
  const journal = o.journal ?? ((m: string) => console.warn(`[extensions] ${m}`))
  let enCours: Promise<ResultatVerification> | undefined
  let minuteur: ReturnType<typeof setInterval> | undefined
  let depart: ReturnType<typeof setTimeout> | undefined

  async function verification(): Promise<ResultatVerification> {
    const misesAJour: ResultatVerification['misesAJour'] = []
    const erreurs: string[] = []
    const echec = (m: string): void => {
      erreurs.push(m)
      journal(`mise à jour : ${m}`)
    }

    for (const e of o.registre.lister().filter((x) => x.source === 'cws')) {
      try {
        const distante = await o.versionDistanteCws(e.id)
        if (!distante || comparerVersions(distante, e.version) <= 0) continue
        const r = await o.mettreAJourCws(e.id)
        if (r.etat === 'installee') misesAJour.push({ id: r.id, nom: r.nom, de: e.version, vers: r.version })
        else echec(`${e.nom} : ${r.etat === 'erreur' ? r.raison : 'installation manuelle requise'}`)
      } catch (err) {
        echec(`${e.nom} : ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (o.derniereVersionUbo && o.installerUbo) {
      for (const e of o.registre.lister().filter(estUbo)) {
        try {
          const derniere = await o.derniereVersionUbo()
          if (comparerVersions(derniere, e.version) <= 0) continue
          const r = await o.installerUbo()
          if (r.etat === 'installee') misesAJour.push({ id: r.id, nom: r.nom, de: e.version, vers: r.version })
          else echec(`${e.nom} : ${r.etat === 'erreur' ? r.raison : 'installation manuelle requise'}`)
        } catch (err) {
          echec(`${e.nom} : ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    let derniereVerification: string | undefined
    if (erreurs.length === 0) {
      derniereVerification = maintenant().toISOString()
      o.reglages.setSettings({ extensions: { derniereVerification } } as never)
    }
    return { misesAJour, erreurs, ...(derniereVerification ? { derniereVerification } : {}) }
  }

  const api: MiseAJour = {
    verifier() {
      // Une seule vérification à la fois : un appel pendant une autre rend la même promesse.
      enCours ??= verification().finally(() => {
        enCours = undefined
      })
      return enCours
    },
    demarrer() {
      api.arreter()
      const echeance = (): void => {
        if (o.reglages.getSettings().extensions.majAuto) void api.verifier().catch((e) => journal(`mise à jour : ${String(e)}`))
      }
      depart = setTimeout(echeance, o.delaiDemarrageMs ?? 0)
      depart.unref?.()
      minuteur = setInterval(echeance, INTERVALLE_MAJ_MS)
      minuteur.unref?.()
    },
    arreter() {
      if (minuteur) clearInterval(minuteur)
      if (depart) clearTimeout(depart)
      minuteur = depart = undefined
    }
  }
  return api
}
