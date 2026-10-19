import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import '../ui/theme.css'
import './settings.css'
import { Historique } from './Historique'
import { Favoris } from './Favoris'

interface Section {
  id: string
  titre: string
}

const SECTIONS: Section[] = [
  { id: 'general', titre: 'Général' },
  { id: 'apparence', titre: "Le ciel et l'apparence" },
  { id: 'couleurs', titre: 'Couleurs et thèmes' },
  { id: 'palette', titre: 'Palette et recherche' },
  { id: 'boucliers', titre: 'Boucliers' },
  { id: 'sites', titre: 'Règles par site' },
  { id: 'extensions', titre: 'Extensions' },
  { id: 'confidentialite', titre: 'Confidentialité' },
  { id: 'telechargements', titre: 'Téléchargements' },
  { id: 'raccourcis', titre: 'Raccourcis clavier' },
  { id: 'gestes', titre: 'Gestes et souris' },
  { id: 'nepasderanger', titre: 'Ne pas déranger' },
  { id: 'demarrage', titre: 'Démarrage et sessions' },
  { id: 'styles', titre: 'Styles et scripts' },
  { id: 'reseau', titre: 'Réseau et identité' },
  { id: 'importer', titre: 'Importer et exporter' },
  { id: 'sauvegarde', titre: 'Sauvegarde et profils' },
  { id: 'historique', titre: 'Historique' },
  { id: 'favoris', titre: 'Favoris' },
  { id: 'labo', titre: 'Labo' },
  { id: 'apropos', titre: 'À propos' }
]

/** Hôtes lyra:// qui ouvrent directement une section (lyra://history → #/historique). */
const SECTION_DE_L_HOTE: Record<string, string> = { history: 'historique', bookmarks: 'favoris' }

/** Route courante : le hash (`#/historique`) prime, sinon l'hôte lyra://, sinon « general ». */
function routeDepuisHash(hash: string, hote: string = location.hostname): string {
  return hash.replace(/^#\/?/, '').split('/')[0] || SECTION_DE_L_HOTE[hote] || 'general'
}

function App() {
  const [route, setRoute] = useState(() => routeDepuisHash(location.hash))
  useEffect(() => {
    const maj = (): void => setRoute(routeDepuisHash(location.hash))
    window.addEventListener('hashchange', maj)
    return () => window.removeEventListener('hashchange', maj)
  }, [])

  const titre = SECTIONS.find((s) => s.id === route)?.titre ?? 'Général'
  return (
    <div class="reglages">
      <nav class="nav" aria-label="Sections des réglages">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#/${s.id}`} class={s.id === route ? 'on' : undefined}>
            {s.titre}
          </a>
        ))}
      </nav>
      <main class="contenu">
        <h1>{titre}</h1>
        {route === 'historique' && <Historique />}
        {route === 'favoris' && <Favoris />}
      </main>
    </div>
  )
}

render(<App />, document.getElementById('app')!)
