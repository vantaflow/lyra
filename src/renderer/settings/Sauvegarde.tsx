import { Ligne, Titre } from './controles'
import './sections.css'

export function Sauvegarde() {
  return (
    <>
      <Titre>Sauvegarde</Titre>
      <div class="card">
        <Ligne reglage="sauvegarde.exporter" titre="Exporter et importer vos données" aide="Réglages, favoris, historique et ciel : depuis « Importer et exporter »">
          <a class="btn lien" href="#/importer">
            Ouvrir « Importer et exporter »
          </a>
        </Ligne>
      </div>

    </>
  )
}
