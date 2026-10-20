import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import '../ui/theme.css'
import './settings.css'
import { Historique } from './Historique'
import { Favoris } from './Favoris'
import { Telechargements } from './Telechargements'
import { General } from './General'
import { ActionsReglages } from './ActionsReglages'
import { Reseau } from './Reseau'
import { PageImport } from './PageImport'
import { Apparence } from './Apparence'
import { PaletteSection } from './PaletteSection'
import { BouclierSection } from './BouclierSection'
import { Emplacement } from './Emplacement'
import { filtrerSections, routeDepuisHash, SECTIONS } from './sections'

function App() {
  const [route, setRoute] = useState(() => routeDepuisHash(location.hash, location.hostname))
  useEffect(() => {
    const maj = (): void => setRoute(routeDepuisHash(location.hash, location.hostname))
    window.addEventListener('hashchange', maj)
    // Un changement de hash survenu entre le premier rendu et cet abonnement (l'effet attend la prochaine image,
    // qui tarde dans une fenêtre cachée ou en arrière-plan) serait sinon perdu.
    maj()
    return () => window.removeEventListener('hashchange', maj)
  }, [])

  const [recherche, setRecherche] = useState('')
  const visibles = filtrerSections(recherche)
  const titre = SECTIONS.find((s) => s.id === route)?.libelle ?? (route === 'historique' ? 'Historique' : route === 'favoris' ? 'Favoris' : 'Général')
  return (
    <div class="reglages">
      <nav class="nav" aria-label="Sections des réglages">
        <label for="chercher-reglage" class="sr-only">
          Rechercher un réglage
        </label>
        <input
          id="chercher-reglage"
          class="chercher"
          type="search"
          placeholder="Rechercher un réglage…"
          value={recherche}
          onInput={(e) => setRecherche((e.currentTarget as HTMLInputElement).value)}
        />
        {visibles.map((s) => (
          <a key={s.id} href={s.route} class={s.id === route ? 'on' : undefined}>
            {s.libelle}
          </a>
        ))}
        {visibles.length === 0 && <p class="aucun">Aucun réglage trouvé.</p>}
      </nav>
      <main class="contenu">
        <div class="entete">
          <h1>{titre}</h1>
          {(route === 'general' || route === 'apparence') && <ActionsReglages />}
        </div>
        {route === 'general' && <General />}
        {route === 'apparence' && <Apparence />}
        {route === 'couleurs' && <Emplacement description="Couleurs du ciel, de la capsule et des pages de Lyra." />}
        {route === 'palette' && <PaletteSection />}
        {route === 'boucliers' && <BouclierSection />}
        {route === 'sites' && <Emplacement description="Boucliers, cookies, zoom et permissions réglés site par site." />}
        {route === 'extensions' && (
          <Emplacement description="Les extensions se gèrent dans leur page." lien={{ href: 'lyra://extensions', libelle: 'Ouvrir les extensions' }} />
        )}
        {route === 'confidentialite' && <Emplacement description="Effacer l'historique, cookies et données de site." />}
        {route === 'telechargements' && <Telechargements />}
        {route === 'raccourcis' && <Emplacement description="Raccourcis clavier de Lyra." />}
        {route === 'gestes' && <Emplacement description="Gestes de souris et molette." />}
        {route === 'nepasderanger' && <Emplacement description="Silence des notifications et exceptions par site." />}
        {route === 'demarrage' && <Emplacement description="Page de démarrage et restauration des sessions." />}
        {route === 'styles' && <Emplacement description="Styles et scripts personnalisés." />}
        {route === 'reseau' && <Reseau />}
        {route === 'importer' && <PageImport />}
        {route === 'sauvegarde' && <Emplacement description="Sauvegarde des réglages et profils." />}
        {route === 'labo' && <Emplacement description="Fonctions expérimentales." />}
        {route === 'apropos' && <Emplacement description="Version et informations sur Lyra." />}
        {route === 'historique' && <Historique />}
        {route === 'favoris' && <Favoris />}
      </main>
    </div>
  )
}

render(<App />, document.getElementById('app')!)
