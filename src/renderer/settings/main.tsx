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

  // Résultats navigables au clavier : sections puis lignes, dans l'ordre d'affichage.
  const options = filtre ? [...visibles.map((s) => ({ id: s.id, section: s.id })), ...lignesTrouvees] : []
  const [actif, setActif] = useState(-1)
  const ouvrir = (o: { id: string; section: string }): void => {
    location.hash = `#/${o.section}`
    setCible({ id: o.id, n: Date.now() })
  }

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
      el.focus({ preventScroll: true })
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
          role="combobox"
          list="resultats-reglages"
          aria-expanded={filtre}
          aria-controls="resultats-reglages"
          aria-activedescendant={actif >= 0 && options[actif] ? `opt-${options[actif].id}` : undefined}
          onInput={(e) => {
            setRecherche((e.currentTarget as HTMLInputElement).value)
            setActif(-1)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setRecherche('')
              setActif(-1)
            } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && options.length > 0) {
              e.preventDefault()
              const pas = e.key === 'ArrowDown' ? 1 : -1
              setActif((actif + pas + options.length) % options.length)
            } else if (e.key === 'Enter' && options.length > 0) {
              e.preventDefault()
              ouvrir(options[actif >= 0 ? actif : 0])
            }
          }}
        />
        <div id="resultats-reglages" class="liste" role={filtre ? 'listbox' : undefined} aria-label={filtre ? 'Résultats' : undefined}>
          {visibles.map((s) => (
            <a
              key={s.id}
              id={`opt-${s.id}`}
              href={s.route}
              role={filtre ? 'option' : undefined}
              aria-selected={filtre ? options[actif]?.id === s.id : undefined}
              class={s.id === route ? 'on' : undefined}
              onClick={() => filtre && setCible({ id: s.id, n: Date.now() })}
            >
              {s.libelle}
            </a>
          ))}
          {lignesTrouvees.map((r) => (
            <button
              key={r.id}
              id={`opt-${r.id}`}
              type="button"
              role="option"
              class="resultat"
              aria-selected={options[actif]?.id === r.id}
              data-resultat={r.id}
              tabIndex={-1}
              onClick={() => ouvrir(r)}
            >
              {r.libelle}
              <small>{SECTIONS.find((s) => s.id === r.section)?.libelle}</small>
            </button>
          ))}
        </div>
        {visibles.length === 0 && <p class="aucun">Aucun réglage trouvé.</p>}
      </nav>
      <main class="contenu">
        <div class="entete">
          <h1 data-reglage={route} tabIndex={-1}>{titre}</h1>
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
