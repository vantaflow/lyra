import { Interrupteur, Ligne, Titre } from './controles'
import { useReglages } from './reglages'
import './reseau.css'
import './sections.css'

/** Fonctions expérimentales : interrupteurs inertes tant que les fonctions n'existent pas (clés de `labo`). */
export function Labo() {
  const [s] = useReglages()
  if (!s) return null
  return (
    <>
      <Titre>Fonctions expérimentales</Titre>
      <div class="card">
        <Ligne reglage="labo.modeLecture" titre="Mode lecture" aide="Bientôt : une vue épurée des articles, prévue pour la version 2">
          <Interrupteur actif={s.labo['mode-lecture'] === true} libelle="Mode lecture" inerte />
        </Ligne>
        <Ligne reglage="labo.popupsExtension" titre="Fenêtres des extensions dans l'overlay" aide="Bientôt : afficher les fenêtres des extensions au-dessus de la page">
          <Interrupteur actif={s.labo['popups-extension'] === true} libelle="Fenêtres des extensions dans l'overlay" inerte />
        </Ligne>
      </div>
      <p class="note">Ces fonctions ne sont pas terminées : elles peuvent changer ou disparaître.</p>
    </>
  )
}
