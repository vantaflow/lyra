import { useEffect, useState } from 'preact/hooks'
import { normaliserAccueil } from '../../shared/accueil'
import { Interrupteur, Ligne, Segments, Titre } from './controles'
import { useReglages } from './reglages'
import './reseau.css'
import './sections.css'

const FENETRES = [
  { id: 'accueil', libelle: "Page d'accueil", inactif: true },
  { id: 'session', libelle: 'Dernière session', inactif: true },
  { id: 'vide', libelle: 'Page vide', inactif: true }
] as const

export function Demarrage() {
  const [s, regler] = useReglages()
  const [saisie, setSaisie] = useState('')
  const [refus, setRefus] = useState('')
  const accueil = s?.demarrage.pageAccueil
  // La saisie suit la valeur enregistrée (premier chargement, import de réglages).
  useEffect(() => {
    if (accueil !== undefined) setSaisie(accueil)
  }, [accueil])
  if (!s) return null

  const valider = (): void => {
    const adresse = normaliserAccueil(saisie)
    if (adresse === null) {
      setRefus("Adresse non valable : seules les adresses http://, https:// et lyra:// sont acceptées.")
      return
    }
    setRefus('')
    setSaisie(adresse)
    if (adresse !== s.demarrage.pageAccueil) regler({ demarrage: { pageAccueil: adresse } })
  }

  return (
    <>
      <Titre>Au démarrage</Titre>
      <div class="card">
        <Ligne reglage="demarrage.restaurer" titre="Rouvrir les étoiles de la dernière session" aide="Sinon, Lyra s'ouvre sur la page d'accueil">
          <Interrupteur actif={s.demarrage.restaurer} libelle="Rouvrir la dernière session" surChange={(restaurer) => regler({ demarrage: { restaurer } })} />
        </Ligne>
        <Ligne reglage="demarrage.pageAccueil" titre="Page d'accueil" aide="Laissez vide pour ouvrir le nouvel onglet">
          <input
            class="inp champ-accueil"
            type="text"
            inputMode="url"
            aria-label="Page d'accueil"
            placeholder="https://exemple.fr"
            value={saisie}
            onInput={(e) => {
              setSaisie((e.currentTarget as HTMLInputElement).value)
              setRefus('')
            }}
            onBlur={valider}
            onKeyDown={(e) => {
              if (e.key === 'Enter') valider()
            }}
          />
        </Ligne>
        {refus && (
          <p class="refus" role="alert">
            {refus}
          </p>
        )}
        <Ligne reglage="demarrage.nouvelleFenetre" titre="Nouvelle fenêtre" aide="Bientôt : choisir ce que montre une nouvelle fenêtre">
          {/* Aucun choix n'est mis en avant : la valeur enregistrée n'a pas encore d'effet (une nouvelle fenêtre ouvre le nouvel onglet). */}
          <Segments<string> valeur="" options={[...FENETRES]} />
        </Ligne>
      </div>
    </>
  )
}
