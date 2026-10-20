import { useEffect, useRef, useState } from 'preact/hooks'
import type { Ref } from 'preact'
import type { ScriptPerso } from '../../shared/types'
import { Interrupteur } from './controles'

/** Taille maximale d'un style ou d'un script (octets UTF-8), comme `validate-d.ts`. */
export const OCTETS_MAX = 100 * 1024
/** Délai de la sauvegarde différée d'une saisie (ms). */
export const DELAI_SAUVEGARDE = 600

export const octets = (t: string): number => new TextEncoder().encode(t).length

/**
 * Texte édité avec sauvegarde différée : `sauver` est appelé `delai` ms après la dernière frappe, tout de suite à la perte du focus
 * et au démontage. Une valeur venue de l'extérieur (`valeur`) n'écrase la saisie que si aucune sauvegarde n'est en attente.
 */
function useTexteDiffere(valeur: string, sauver: (t: string) => void, accepte: (t: string) => boolean = () => true, delai = DELAI_SAUVEGARDE) {
  const [texte, setTexte] = useState(valeur)
  const attente = useRef<{ minuteur: number; texte: string } | null>(null)
  const dernier = useRef({ sauver, accepte })
  dernier.current = { sauver, accepte }
  const flush = (): void => {
    const a = attente.current
    if (!a) return
    window.clearTimeout(a.minuteur)
    attente.current = null
    dernier.current.sauver(a.texte)
  }
  useEffect(() => {
    if (!attente.current) setTexte(valeur)
  }, [valeur])
  useEffect(() => flush, [])
  const saisir = (t: string): void => {
    setTexte(t)
    if (attente.current) window.clearTimeout(attente.current.minuteur)
    if (!dernier.current.accepte(t)) {
      attente.current = null
      return
    }
    attente.current = { texte: t, minuteur: window.setTimeout(flush, delai) }
  }
  return { texte, saisir, flush }
}

/** Éditeur monospace de code (style ou script) : 100 Ko au plus, sauvegarde différée. */
export function EditeurCode(p: {
  valeur: string
  libelle: string
  sauver: (t: string) => void
  id?: string
  champ?: Ref<HTMLTextAreaElement>
  rows?: number
}) {
  const { texte, saisir, flush } = useTexteDiffere(p.valeur, p.sauver, (t) => octets(t) <= OCTETS_MAX)
  const trop = octets(texte) > OCTETS_MAX
  return (
    <>
      <textarea
        id={p.id}
        ref={p.champ}
        class="zone-code"
        aria-label={p.libelle}
        aria-invalid={trop}
        spellcheck={false}
        rows={p.rows ?? 5}
        value={texte}
        onInput={(e) => saisir((e.currentTarget as HTMLTextAreaElement).value)}
        onBlur={flush}
      />
      {trop && (
        <span class="hint erreur" role="alert">
          Trop long : 100 Ko au plus (non enregistré).
        </span>
      )}
    </>
  )
}

/** Un script personnalisé : nom, code, actif, supprimer. */
export function EditeurScript(p: { script: ScriptPerso; surChange: (s: ScriptPerso) => void; surSupprimer: () => void }) {
  // Dernier état connu, mis à jour sans attendre le retour des réglages : deux saisies rapprochées (nom puis code) ne s'écrasent pas.
  const dernier = useRef(p.script)
  dernier.current = p.script
  const changer = (champs: Partial<ScriptPerso>): void => {
    dernier.current = { ...dernier.current, ...champs }
    p.surChange(dernier.current)
  }
  const nom = useTexteDiffere(p.script.nom, (t) => changer({ nom: t }), (t) => t.length > 0 && t.length <= 100)
  return (
    <div class="script-perso" data-script={p.script.nom}>
      <div class="script-entete">
        <input
          class="champ"
          type="text"
          aria-label="Nom du script"
          aria-invalid={nom.texte.length === 0}
          maxLength={100}
          value={nom.texte}
          onInput={(e) => nom.saisir((e.currentTarget as HTMLInputElement).value)}
          onBlur={nom.flush}
        />
        <Interrupteur actif={p.script.actif} libelle={`Script « ${p.script.nom} » actif`} surChange={(actif) => changer({ actif })} />
        <button class="btn danger" type="button" aria-label={`Supprimer le script « ${p.script.nom} »`} onClick={p.surSupprimer}>
          Supprimer le script
        </button>
      </div>
      <EditeurCode valeur={p.script.code} libelle={`Code du script « ${p.script.nom} »`} sauver={(code) => changer({ code })} />
    </div>
  )
}
