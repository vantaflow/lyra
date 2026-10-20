import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { accelerateurDeEvenement } from '../../shared/accelerateur'
import { COMMANDES, GROUPES, defautDe, estParDefaut, messageRefus, natives, patchToutParDefaut, redefinissable, tableEffective, tenterAttribution, type DefCommande } from '../../shared/commandes'
import { afficherAccelerateur } from '../ui/raccourcis'
import { Ligne, Titre } from './controles'
import { useReglages } from './reglages'
import './raccourcis.css'

/** Réglages « Raccourcis clavier » : une ligne par commande, capture d'une combinaison, « Par défaut » par ligne et global. */

const MODIFICATEURS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS'])

export function Raccourcis() {
  const [s, regler] = useReglages()
  /** Commande dont la combinaison est en cours de saisie. */
  const [capture, setCapture] = useState<string | null>(null)
  const [refus, setRefus] = useState<{ id: string; message: string } | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (capture) bouton.current?.focus()
  }, [capture])
  if (!s) return null
  const plateforme = window.lyra.plateforme
  const table = s.raccourcis
  const effective = tableEffective(table, plateforme)
  const nbPerso = COMMANDES.filter((c) => redefinissable(c, plateforme) && !estParDefaut(c.id, table, plateforme)).length

  const surTouche = (c: DefCommande, e: KeyboardEvent): void => {
    // Pendant la saisie, la touche appartient à la capture (ni la page ni le menu ne doivent la traiter).
    e.preventDefault()
    e.stopPropagation()
    if (MODIFICATEURS.has(e.key)) return
    if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      setCapture(null)
      return
    }
    const saisie = accelerateurDeEvenement({ key: e.key, code: e.code, control: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey }, plateforme)
    setCapture(null)
    const r = saisie ? tenterAttribution(table, c.id, saisie, plateforme) : ({ ok: false, raison: 'invalide' } as const)
    if (!r.ok) {
      setRefus({ id: c.id, message: messageRefus(r) })
      return
    }
    setRefus(null)
    regler({ raccourcis: { [c.id]: r.valeur } })
  }

  const ligne = (c: DefCommande) => {
    const modifiable = redefinissable(c, plateforme)
    const accel = modifiable ? effective[c.id] : defautDe(c, plateforme)
    const perso = modifiable && !estParDefaut(c.id, table, plateforme)
    const enCours = capture === c.id
    return (
      <Fragment key={c.id}>
        <Ligne reglage={`raccourcis-${c.id}`} titre={c.libelle} aide={modifiable ? undefined : 'Géré par le système'}>
          {perso && (
            <button class="btn" type="button" aria-label={`Rétablir « ${c.libelle} » par défaut`} onClick={() => { setRefus(null); regler({ raccourcis: { [c.id]: '' } }) }}>
              Par défaut
            </button>
          )}
          {modifiable ? (
            <button
              ref={enCours ? bouton : undefined}
              class={`touche${enCours ? ' capture' : ''}${perso ? ' perso' : ''}`}
              type="button"
              aria-label={enCours ? `${c.libelle} : tapez la nouvelle combinaison, Échap pour annuler` : `${c.libelle} : ${afficherAccelerateur(accel)}, cliquer pour modifier`}
              onClick={() => { setRefus(null); setCapture(enCours ? null : c.id) }}
              onKeyDown={enCours ? (e) => surTouche(c, e as unknown as KeyboardEvent) : undefined}
              onBlur={() => enCours && setCapture(null)}
            >
              {enCours ? 'Tapez la combinaison…' : afficherAccelerateur(accel)}
            </button>
          ) : (
            <span class="touche fixe">{afficherAccelerateur(accel)}</span>
          )}
        </Ligne>
        {refus?.id === c.id && (
          <p class="touche-refus" role="alert">
            {refus.message}
          </p>
        )}
      </Fragment>
    )
  }

  return (
    <>
      <p class="sous-titre">Cliquez sur une combinaison, puis tapez la nouvelle. Échap annule.</p>
      <div class="card">
        <Ligne reglage="raccourcis.commandes" titre="Raccourcis des commandes" aide="Une combinaison doit contenir ⌘ ou Ctrl (sauf les touches F) et ne peut servir qu'à une commande.">
          <button class="btn" type="button" disabled={nbPerso === 0} onClick={() => { setRefus(null); regler({ raccourcis: patchToutParDefaut(table) }) }}>
            Tout par défaut
          </button>
        </Ligne>
      </div>
      {GROUPES.map((g) => (
        <section key={g}>
          <Titre>{g}</Titre>
          <div class="card">{COMMANDES.filter((c) => c.groupe === g).map(ligne)}</div>
        </section>
      ))}
      <Titre>Édition</Titre>
      <div class="card">
        {natives(plateforme).map((n) => (
          <Ligne key={n.libelle} titre={n.libelle} aide="Géré par le système">
            <span class="touche fixe">{afficherAccelerateur(n.accelerateur)}</span>
          </Ligne>
        ))}
      </div>
    </>
  )
}
