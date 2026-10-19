import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import '../ui/theme.css'
import './settings.css'

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
  { id: 'labo', titre: 'Labo' },
  { id: 'apropos', titre: 'À propos' }
]

const TITRES_AUTRES: Record<string, string> = {
  historique: 'Historique',
  favoris: 'Favoris'
}

/** Route courante lue dans le hash (`#/historique`), « general » par défaut. */
function routeDepuisHash(hash: string): string {
  return hash.replace(/^#\/?/, '').split('/')[0] || 'general'
}

function App() {
  const [route, setRoute] = useState(() => routeDepuisHash(location.hash))
  useEffect(() => {
    const maj = (): void => setRoute(routeDepuisHash(location.hash))
    window.addEventListener('hashchange', maj)
    return () => window.removeEventListener('hashchange', maj)
  }, [])

  const titre = SECTIONS.find((s) => s.id === route)?.titre ?? TITRES_AUTRES[route] ?? 'Général'
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
      </main>
    </div>
  )
}

render(<App />, document.getElementById('app')!)
