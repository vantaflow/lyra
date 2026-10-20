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
import { Apropos } from './Apropos'
import { PageImport } from './PageImport'
import { MESSAGE_SECTION_A_VENIR, routeDepuisHash, sectionDe, sectionsVisibles } from './sections'

/**
 * Lien du sommaire. Les hôtes lyra://history, bookmarks, downloads et shields servent aussi cette page, mais certains
 * canaux (import, export…) ne répondent qu'à lyra://settings : hors de cet hôte, le sommaire y mène.
 */
function lienSection(id: string, hote: string = location.hostname): string {
  if (id === 'extensions') return 'lyra://extensions'
  return hote === 'settings' ? `#/${id}` : `lyra://settings#/${id}`
}

function App() {
  const [brute, setRoute] = useState(() => routeDepuisHash(location.hash, location.hostname))
  useEffect(() => {
    const maj = (): void => setRoute(routeDepuisHash(location.hash, location.hostname))
    window.addEventListener('hashchange', maj)
    // Un changement de hash survenu entre le premier rendu et cet abonnement (l'effet attend la prochaine image,
    // qui tarde dans une fenêtre cachée ou en arrière-plan) serait sinon perdu.
    maj()
    return () => window.removeEventListener('hashchange', maj)
  }, [])

  // Adresse inconnue : la section Générale.
  const section = sectionDe(brute) ?? sectionDe('general')!
  const route = section.id
  const titre = section.titre
  return (
    <div class="reglages">
      <nav class="nav" aria-label="Sections des réglages">
        {sectionsVisibles().map((s) => (
          <a key={s.id} href={lienSection(s.id)} class={s.id === route ? 'on' : undefined} aria-current={s.id === route ? 'page' : undefined}>
            {s.titre}
          </a>
        ))}
      </nav>
      <main class="contenu">
        <div class="entete">
          <h1>{titre}</h1>
          {route === 'general' && <ActionsReglages />}
        </div>
        {route === 'general' && <General />}
        {route === 'historique' && <Historique />}
        {route === 'favoris' && <Favoris />}
        {route === 'telechargements' && <Telechargements />}
        {route === 'reseau' && <Reseau />}
        {route === 'apropos' && <Apropos />}
        {route === 'importer' && <PageImport />}
        {route === 'extensions' && (
          <p class="vide">
            <a href="lyra://extensions">Gérer les extensions</a>
          </p>
        )}
        {!section.disponible && (
          <p class="vide" id="section-a-venir">
            {MESSAGE_SECTION_A_VENIR}
          </p>
        )}
      </main>
    </div>
  )
}

render(<App />, document.getElementById('app')!)
