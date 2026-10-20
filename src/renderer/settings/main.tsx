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
import { chercher } from './recherche'
import { routeDepuisHash, SECTIONS } from './sections'

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
  const resultats = chercher(recherche)
  const filtre = recherche.trim() !== ''
  const sectionsTrouvees = new Set(resultats.map((r) => r.section))
  const visibles = filtre ? SECTIONS.filter((s) => sectionsTrouvees.has(s.id)) : SECTIONS
  const lignesTrouvees = resultats.filter((r) => r.type === 'ligne')

  // Résultat choisi : on défile jusqu'à la ligne (`data-reglage`) et on la met en évidence. Les lignes se rendent après
  // le chargement des réglages : on réessaie brièvement.
  const [cible, setCible] = useState<{ id: string; n: number } | null>(null)
  useEffect(() => {
    if (!cible) return
    let essais = 0
    let fin: number | undefined
    const cherche = window.setInterval(() => {
      const el = document.querySelector<HTMLElement>(`[data-reglage="${cible.id}"]`)
      if (!el && ++essais < 40) return
      window.clearInterval(cherche)
      if (!el) return
      el.scrollIntoView?.({ block: 'center' })
      el.classList.add('trouve')
      fin = window.setTimeout(() => el.classList.remove('trouve'), 2500)
    }, 50)
    return () => {
      window.clearInterval(cherche)
      window.clearTimeout(fin)
      document.querySelector('.trouve')?.classList.remove('trouve')
    }
  }, [cible])
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
          onKeyDown={(e) => {
            if (e.key === 'Escape') setRecherche('')
          }}
        />
        {visibles.map((s) => (
          <a key={s.id} href={s.route} class={s.id === route ? 'on' : undefined} onClick={() => filtre && setCible({ id: s.id, n: Date.now() })}>
            {s.libelle}
          </a>
        ))}
        {lignesTrouvees.length > 0 && (
          <div class="trouves" aria-label="Réglages trouvés">
            {lignesTrouvees.map((r) => (
              <button
                key={r.id}
                type="button"
                data-resultat={r.id}
                onClick={() => {
                  location.hash = `#/${r.section}`
                  setCible({ id: r.id, n: Date.now() })
                }}
              >
                {r.libelle}
                <small>{SECTIONS.find((s) => s.id === r.section)?.libelle}</small>
              </button>
            ))}
          </div>
        )}
        {visibles.length === 0 && <p class="aucun">Aucun réglage trouvé.</p>}
      </nav>
      <main class="contenu">
        <div class="entete">
          <h1 data-reglage={route}>{titre}</h1>
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
