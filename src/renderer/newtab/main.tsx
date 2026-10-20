import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import '../ui/theme.css'
import { demarrerTheme } from '../ui/themeVivant'
import './newtab.css'
import { MOTEURS, moteurParId } from '../../main/palette/engines'
import type { Constellation, HistoryEntry, Settings, Star } from '../../shared/types'
import type { StatsBoucliers } from '../../shared/ipc'
import { Ciel } from './Ciel'
import { PremierLancement } from './PremierLancement'

const COULEURS_SITES = ['#1E7F6C', '#5452C8', '#3A3A62', '#D97A2B', '#2D5BD1', '#B5452F', '#7A3EB1', '#1F6FB2']

const ICONE_CHEVRON = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

function hote(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function nomDuSite(e: HistoryEntry): string {
  return e.title && e.title.length <= 24 ? e.title : hote(e.url)
}

function couleurDuSite(url: string): string {
  let h = 0
  for (const c of hote(url)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return COULEURS_SITES[h % COULEURS_SITES.length]
}

const nombre = (n: number): string => n.toLocaleString('fr-FR')

/** `privee` : fenêtre privée — ni constellations, ni sites fréquents, ni compteur des Boucliers (rien n'est lu des données de l'utilisateur). */
function NouvelOnglet({ privee }: { privee: boolean }) {
  const [heure] = useState(() => new Date().getHours())
  const [reglages, setReglages] = useState<Settings | null>(null)
  const [constellations, setConstellations] = useState<Constellation[]>([])
  const [etoiles, setEtoiles] = useState<Star[]>([])
  const [sites, setSites] = useState<HistoryEntry[]>([])
  const [stats, setStats] = useState<StatsBoucliers | null>(null)
  const [menu, setMenu] = useState(false)
  const champ = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.lyra.invoke('settings:get').then(setReglages)
    if (!privee) {
      void window.lyra.invoke('sky:get').then(({ sky }) => (setConstellations(sky.constellations), setEtoiles(sky.stars)))
      void window.lyra.invoke('history:frequent', { n: 8 }).then(setSites)
      void window.lyra.invoke('shields:stats').then(setStats)
    }
    return window.lyra.on('settings:changed', setReglages)
  }, [privee])
  useEffect(() => champ.current?.focus(), [reglages?.moteurChoisi])

  const jour = heure < 18
  const moteur = moteurParId(reglages?.moteurParDefaut ?? 'duckduckgo')

  const chercher = (e: Event): void => {
    e.preventDefault()
    const texte = champ.current?.value ?? ''
    if (texte.trim()) void window.lyra.invoke('palette:go', { texte, nouvelleEtoile: false })
  }
  const choisirMoteur = (id: string): void => {
    setMenu(false)
    void window.lyra.invoke('settings:set', { moteurParDefaut: id })
  }
  const ouvrirSite = (e: HistoryEntry): void =>
    void window.lyra.invoke('palette:go', { suggestion: { type: 'historique', titre: e.title, url: e.url }, texte: e.url, nouvelleEtoile: false })
  const ouvrir = (url: string): void => void window.lyra.invoke('tabs:open', { url })

  return (
    <>
      <Ciel />
      {privee && (
        <div class="bandeau-prive" role="status">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
            <path d="M4 4l16 16" />
          </svg>
          <b>Fenêtre privée</b>
          <span>Historique, cookies et session sont effacés à la fermeture.</span>
        </div>
      )}
      <main class="nouvel-onglet">
        <div class="salut">
          <p class="titre">{jour ? 'Bonjour.' : 'Bonsoir.'}</p>
          <p class="sous">{jour ? "Que cherchez-vous aujourd'hui ?" : 'Que cherchez-vous ce soir ?'}</p>
        </div>

        {reglages && !reglages.moteurChoisi ? (
          <PremierLancement surChoix={() => void window.lyra.invoke('settings:get').then(setReglages)} />
        ) : (
          <form role="search" class="recherche" onSubmit={chercher}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#9E9EC8" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M20 20l-4.2-4.2" />
            </svg>
            <label for="recherche" class="sr-only">Rechercher ou saisir une adresse</label>
            <input id="recherche" ref={champ} type="text" placeholder="Rechercher ou saisir une adresse" autocomplete="off" />
            <div class="moteur-zone">
              <button type="button" class="moteur-chip" aria-label={`Moteur de recherche : ${moteur.nom}, changer`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                {moteur.nom}
                {ICONE_CHEVRON}
              </button>
              {menu && (
                <div class="menu-moteurs" role="menu">
                  {MOTEURS.map((m) => (
                    <button key={m.id} type="button" role="menuitemradio" aria-checked={m.id === moteur.id} class={m.id === moteur.id ? 'on' : undefined} onClick={() => choisirMoteur(m.id)}>
                      {m.nom}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </form>
        )}

        {!privee && (
        <section aria-label="Vos constellations" class="bloc">
          <h2>Vos constellations</h2>
          <div class="chips">
            {constellations.map((c) => {
              const siennes = etoiles.filter((s) => s.constellationId === c.id)
              const dormante = siennes.length > 0 && siennes.every((s) => s.dormant)
              return (
                <button key={c.id} class="chip" type="button" onClick={() => siennes[0] && void window.lyra.invoke('tabs:activate', { id: siennes[0].id })}>
                  <span class="pt" style={{ background: c.color }} />
                  {c.name}
                  <span class="nb">{dormante ? 'dormante' : siennes.length}</span>
                </button>
              )
            })}
            <button class="chip inerte" type="button" aria-disabled="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              Nouvelle constellation
            </button>
          </div>
        </section>
        )}

        {!privee && (
        <section aria-label="Sites fréquents" class="bloc bloc-sites">
          <h2>Sites fréquents</h2>
          <div class="sites">
            {sites.map((e) => (
              <button key={e.url} class="site" type="button" onClick={() => ouvrirSite(e)}>
                <i style={{ background: couleurDuSite(e.url) }}>{(nomDuSite(e)[0] ?? '?').toUpperCase()}</i>
                {nomDuSite(e)}
              </button>
            ))}
          </div>
        </section>
        )}
      </main>

      <div class="pied">
        {!privee && (
        <span class="bouclier">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          {nombre(stats?.semaine ?? 0)} éléments bloqués cette semaine
        </span>
        )}
        <span>Aucune donnée ne quitte cet ordinateur.</span>
        <span class="souple" />
        <a href="lyra://history" onClick={(e) => (e.preventDefault(), ouvrir('lyra://history'))}>Historique</a>
        <a href="lyra://bookmarks" onClick={(e) => (e.preventDefault(), ouvrir('lyra://bookmarks'))}>Favoris</a>
      </div>
    </>
  )
}

/** La fenêtre est-elle privée ? Réponse du main (la page n'en décide pas) ; rien n'est affiché avant, pour éviter un flash. */
function Racine() {
  const [privee, setPrivee] = useState<boolean | null>(null)
  useEffect(() => {
    void window.lyra.invoke('fenetre:privee').then(setPrivee, () => setPrivee(true))
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('privee', privee === true)
  }, [privee])
  return privee === null ? null : <NouvelOnglet privee={privee} />
}

demarrerTheme()
render(<Racine />, document.getElementById('app')!)
