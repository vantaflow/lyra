/** Contrat de l'export et de l'import de fichiers (jalon E, Task 4) ; types seulement, importables par la page de réglages. */
import type { ResultatImport } from '../import/types'

/** Sauf mention contraire, `chemin` n'est lu que sous LYRA_TEST=1 (sans lui : boîte de dialogue native). */
export interface DemandeExportFichier {
  chemin?: string
}

export interface DemandeExportPaquet extends DemandeExportFichier {
  /** 8 caractères au moins ; jamais conservée. */
  phrase: string
  /** Inclure les cookies et sessions de `persist:lyra` (décoché par défaut). */
  cookies?: boolean
}

export type CodeErreurExport = 'annule' | 'prive' | 'en-cours' | 'phrase-courte' | 'ecriture'

/** `message` est destiné à l'utilisateur ; `annule` : boîte de dialogue fermée, rien d'écrit. */
export type ResultatExport = { ok: true; chemin: string; /** Éléments écrits (favoris, pages, étoiles…). */ compte: number } | { ok: false; erreur: CodeErreurExport; message?: string }

export type TypeFichierImport = 'favoris' | 'historique' | 'ciel' | 'reglages' | 'paquet'

export interface DemandeImportFichier {
  type: TypeFichierImport
  chemin?: string
  /** Paquet seulement. */
  phrase?: string
  /** Paquet seulement : restaurer aussi les cookies et sessions, s'ils sont dans le paquet. */
  cookies?: boolean
}

export type CodeErreurImportFichier = 'annule' | 'prive' | 'en-cours' | 'phrase' | 'phrase-courte' | 'format' | 'version' | 'illisible' | 'volumineux' | 'invalide'

export type ReponseImportFichier =
  | {
      ok: true
      /** Résultat par élément, comme un import depuis un navigateur (source `lyra`). Réglages : voir `reglages`. */
      resultat: ResultatImport
      /** Réglages appliqués (fichier de réglages ou paquet). */
      reglages: boolean
      /** Cookies restaurés. */
      cookies: number
      /** Éléments du paquet ignorés parce qu'illisibles. */
      avertissements: string[]
    }
  | { ok: false; erreur: CodeErreurImportFichier; message: string }

export interface DemandeSauvegardeAuto {
  activer: boolean
  /** Activation : dossier choisi (test) ; absent : boîte de dialogue. */
  dossier?: string
  /** Activation : phrase de passe (8 caractères), jamais conservée. */
  phrase?: string
}

export interface EtatSauvegardeAutoIpc {
  actif: boolean
  dossier?: string
  derniere?: number
  erreur?: string
}

export type ReponseSauvegardeAuto = { ok: true; etat: EtatSauvegardeAutoIpc } | { ok: false; erreur: 'annule' | 'phrase-courte' | 'indisponible' | 'dossier'; message: string }
