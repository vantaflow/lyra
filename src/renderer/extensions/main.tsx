import { render } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import type { CandidatAmo, InfoExtension, JournalExtension, ResultatInstallation, Settings } from '../../shared/types'
import './extensions.css'
import { depuis, etatTexte, hoteDe, LIMITES, lignesJournal, origineTexte, porteeTexte, sitesExclus } from './texte'

/** Couleurs des pastilles du design (Extensions.dc.html), attribuées d'après l'identifiant. */
const COULEURS = ['#B5452F', '#3A3A46', '#2D5BD1', '#1F6FB2', '#1E7F6C', '#8A8AA6']
const couleurDe = (id: string): string => COULEURS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % COULEURS.length]

type Mode = 'journal' | 'sites'

/** Hôte saisi (« https://www.youtube.com/watch », « YouTube.com ») → origine https, ou undefined. */
function origineSaisie(saisie: string): string | undefined {
  const h = saisie.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/)[0]
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/.test(h) && h.length <= 253 ? `https://${h}` : undefined
}

function LigneExtension(p: {
  e: InfoExtension
  journal: JournalExtension | undefined
  sites: Settings['sites']
  mode: Mode | undefined
  surMode: (m: Mode | undefined) => void
  surChangement: () => void
}) {
  const { e, journal, mode } = p
  const [saisie, setSaisie] = useState('')
  const [refus, setRefus] = useState('')
  const incompatible = e.active && !e.chargee
  const exclus = sitesExclus(p.sites, e.id)
  const ouverte = mode !== undefined
  const lettre = e.nom.trim().charAt(0) || '?'

  const interrupteur = async (): Promise<void> => {
    await window.lyra.invoke('extensions:activer', { id: e.id, active: !e.active })
    p.surChangement()
  }
  const supprimer = async (): Promise<void> => {
    await window.lyra.invoke('extensions:desinstaller', { id: e.id })
    p.surMode(undefined)
    p.surChangement()
  }
  const regle = async (origine: string, active: boolean): Promise<void> => {
    const ok = await window.lyra.invoke('extensions:regleSite', { id: e.id, origine, active })
    if (!ok) setRefus('Règle refusée.')
  }
  const exclure = async (): Promise<void> => {
    const origine = origineSaisie(saisie)
    if (!origine) return setRefus('Indique un site, par exemple youtube.com.')
    setRefus('')
    await regle(origine, false)
    setSaisie('')
  }
  const etat = incompatible ? journal?.avertissementsChargement[0] ?? "Chromium n'a pas pu charger cette extension." : etatTexte(e, journal)
  const portee = incompatible ? undefined : porteeTexte(e, exclus)
  const resume = [portee, etat].filter(Boolean).join(' · ')

  const boutons = (
    <>
      {e.aOptions && !incompatible && (
        <button class="btn" type="button" onClick={() => void window.lyra.invoke('extensions:options', { id: e.id })}>
          Options
        </button>
      )}
      {!incompatible && (
        <button class="btn" type="button" onClick={() => p.surMode(mode === 'sites' ? undefined : 'sites')}>
          {mode === 'sites' ? 'Replier' : 'Sites'}
        </button>
      )}
      <button class="btn" type="button" onClick={() => p.surMode(mode === 'journal' ? undefined : 'journal')}>
        {mode === 'journal' ? 'Replier' : 'Journal'}
      </button>
      {(incompatible || ouverte) && (
        <button class="btn danger" type="button" onClick={() => void supprimer()}>
          Supprimer
        </button>
      )}
      {!incompatible && (
        <button class={`tg ${e.active ? 'on' : 'off'}`} type="button" role="switch" aria-checked={e.active} aria-label={`Activer ${e.nom}`} onClick={() => void interrupteur()}>
          <i></i>
        </button>
      )}
    </>
  )

  return (
    <div class={`row ext${ouverte ? ' ouverte' : ''}${incompatible ? ' incompatible' : ''}`}>
      <span class="ico" style={{ background: incompatible ? '#8A8AA6' : couleurDe(e.id) }}>
        {lettre}
      </span>
      <div class="corps">
        <span class="titre-ligne">
          <strong>{e.nom}</strong>
          <span class="hint">{e.version}</span>
          <span class={`tag ${e.magasin === 'firefox' ? 'firefox' : 'chrome'}`}>{origineTexte(e)}</span>
          {incompatible && <span class="tag incompat">Incompatible</span>}
        </span>
        {resume && <span class="hint">{resume}</span>}
        {mode === 'journal' && <pre class="log">{lignesJournal(journal).join('\n')}</pre>}
        {mode === 'sites' && (
          <div class="sites-regles">
            <span class="hint">
              Exclure un site pour cette extension. Limite d'Electron : les scripts qu'une extension injecte ne peuvent pas être retirés site par site, la règle est
              enregistrée dans les réglages (sites.&lt;site&gt;.extensions) sans arrêter les scripts déjà déclarés par le manifest.
            </span>
            {exclus.map((o) => (
              <div class="ligne" key={o}>
                <span>{hoteDe(o)}</span>
                <button class="btn" type="button" onClick={() => void regle(o, true)}>
                  Réactiver
                </button>
              </div>
            ))}
            <div class="ligne">
              <label class="libelle" for={`site-${e.id}`}>
                Site à exclure
              </label>
              <input id={`site-${e.id}`} class="inp" type="text" placeholder="youtube.com" value={saisie} onInput={(ev) => setSaisie((ev.target as HTMLInputElement).value)} onKeyDown={(ev) => ev.key === 'Enter' && void exclure()} />
              <button class="btn" type="button" onClick={() => void exclure()}>
                Exclure
              </button>
            </div>
            {refus && (
              <span class="hint" role="alert">
                {refus}
              </span>
            )}
          </div>
        )}
      </div>
      {boutons}
    </div>
  )
}

interface Retour {
  texte: string
  candidats?: CandidatAmo[]
  chromeId?: { id: string; nom: string }
}

function retourDe(r: ResultatInstallation): Retour {
  switch (r.etat) {
    case 'installee':
      return { texte: `${r.nom} ${r.version} installée.`, chromeId: r.suggestionChrome }
    case 'choix':
      return { texte: r.raison, candidats: r.candidats }
    case 'manuel':
      return { texte: r.raison }
    default:
      return { texte: r.rapport?.refus ? `${r.raison} ${r.rapport.refus}` : r.raison, chromeId: r.suggestionChrome }
  }
}

function Page({ privee }: { privee: boolean }) {
  const [liste, setListe] = useState<InfoExtension[]>([])
  const [journaux, setJournaux] = useState<Record<string, JournalExtension | undefined>>({})
  const [reglages, setReglages] = useState<Settings | null>(null)
  const [ouvertes, setOuvertes] = useState<Record<string, Mode | undefined>>({})
  const [cws, setCws] = useState('')
  const [amo, setAmo] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [retour, setRetour] = useState<Retour | null>(null)
  const [verifiees, setVerifiees] = useState<string | undefined>(undefined)

  const rafraichir = useCallback(async (): Promise<void> => {
    const l = await window.lyra.invoke('extensions:lister')
    setListe(l)
    const paires = await Promise.all(l.map(async (e) => [e.id, await window.lyra.invoke('extensions:journal', { id: e.id })] as const))
    setJournaux(Object.fromEntries(paires))
  }, [])

  useEffect(() => {
    void rafraichir()
    void window.lyra.invoke('settings:get').then((s) => {
      setReglages(s)
      setVerifiees(s.extensions.derniereVerification)
    })
    return window.lyra.on('settings:changed', (s) => {
      setReglages(s)
      setVerifiees((v) => s.extensions.derniereVerification ?? v)
    })
  }, [rafraichir])

  const installer = async (arg: { source?: string; choisir?: 'fichier' | 'dossier' }): Promise<void> => {
    setOccupe(true)
    setRetour(null)
    try {
      const r = await window.lyra.invoke('extensions:installer', arg)
      setRetour(retourDe(r))
      if (r.etat === 'installee') {
        if (arg.source === cws.trim()) setCws('')
        if (arg.source === amo.trim()) setAmo('')
      }
      await rafraichir()
    } catch (e) {
      setRetour({ texte: e instanceof Error ? e.message : String(e) })
    } finally {
      setOccupe(false)
    }
  }
  const toutMettreAJour = async (): Promise<void> => {
    setOccupe(true)
    try {
      const r = await window.lyra.invoke('extensions:majTout')
      setVerifiees(r.derniereVerification ?? new Date().toISOString())
      const n = r.misesAJour.length
      setRetour({ texte: [n === 0 ? 'Tout est à jour.' : `${n} ${n > 1 ? 'extensions mises à jour' : 'extension mise à jour'} : ${r.misesAJour.map((m) => `${m.nom} ${m.de} → ${m.vers}`).join(', ')}.`, ...r.erreurs].join(' ') })
      await rafraichir()
    } finally {
      setOccupe(false)
    }
  }
  const touche = (f: () => void) => (ev: KeyboardEvent): void => {
    if (ev.key === 'Enter') f()
  }

  return (
    <main class="page">
      {privee && <div class="bandeau">Les extensions ne s'exécutent pas en fenêtre privée.</div>}
      <div class="entete">
        <div>
          <h1>Extensions</h1>
          <p>Chrome et Firefox, côte à côte. Ce qui ne marche pas est dit, pas caché.</p>
        </div>
        <button class="btn" type="button" disabled={occupe} onClick={() => void toutMettreAJour()}>
          Tout mettre à jour
        </button>
        <span class="hint">{depuis(verifiees)}</span>
      </div>

      <h2>Installer</h2>
      <div class="card">
        <div class="row">
          <span class="tag fixe chrome">Chrome</span>
          <label for="cws" class="libelle">
            Identifiant ou adresse du Chrome Web Store
          </label>
          <input id="cws" class="inp" type="text" placeholder="Identifiant ou adresse chromewebstore.google.com/detail/…" value={cws} onInput={(e) => setCws((e.target as HTMLInputElement).value)} onKeyDown={touche(() => cws.trim() && void installer({ source: cws.trim() }))} />
          <button class="btn pri" type="button" disabled={occupe || !cws.trim()} onClick={() => void installer({ source: cws.trim() })}>
            Installer
          </button>
        </div>
        <div class="row">
          <span class="tag fixe firefox">Firefox</span>
          <label for="amo" class="libelle">
            Nom ou adresse addons.mozilla.org
          </label>
          <input id="amo" class="inp" type="text" placeholder="Nom ou adresse addons.mozilla.org/fr/firefox/addon/…" value={amo} onInput={(e) => setAmo((e.target as HTMLInputElement).value)} onKeyDown={touche(() => amo.trim() && void installer({ source: amo.trim() }))} />
          <button class="btn pri" type="button" disabled={occupe || !amo.trim()} onClick={() => void installer({ source: amo.trim() })}>
            Installer
          </button>
        </div>
        <div class="row">
          <span class="tag fixe fichier">Fichier</span>
          <span class="fichier-texte">
            Un fichier <strong>.crx</strong>, <strong>.zip</strong> ou <strong>.xpi</strong>, ou un dossier d'extension en développement
          </span>
          {window.lyra.plateforme !== 'darwin' && (
            <button class="btn" type="button" disabled={occupe} onClick={() => void installer({ choisir: 'dossier' })}>
              Dossier…
            </button>
          )}
          <button class="btn" type="button" disabled={occupe} onClick={() => void installer({ choisir: 'fichier' })}>
            Choisir…
          </button>
        </div>
      </div>

      {retour && (
        <div class="card" role="status">
          <div class="row">
            <div class="corps retour">
              <span>{retour.texte}</span>
              {retour.candidats?.map((c) => (
                <div class="candidat" key={c.slug}>
                  <span>
                    <strong>{c.nom}</strong> <span class="hint">{c.auteur} · {c.slug}</span>
                  </span>
                  <button class="btn" type="button" disabled={occupe} onClick={() => void installer({ source: c.slug })}>
                    Installer celle-ci
                  </button>
                </div>
              ))}
              {retour.chromeId && (
                <div class="candidat">
                  <span>Une version Chrome de {retour.chromeId.nom} existe sur le Chrome Web Store.</span>
                  <button class="btn" type="button" disabled={occupe} onClick={() => void installer({ source: retour.chromeId!.id })}>
                    Installer la version Chrome
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <h2>Installées — {liste.length}</h2>
      <div class="card">
        {liste.length === 0 && (
          <div class="row">
            <span class="hint">Aucune extension installée.</span>
          </div>
        )}
        {liste.map((e) => (
          <LigneExtension
            key={e.id}
            e={e}
            journal={journaux[e.id]}
            sites={reglages?.sites ?? {}}
            mode={ouvertes[e.id]}
            surMode={(m) => {
              setOuvertes((o) => ({ ...o, [e.id]: m }))
              if (m === 'journal') void window.lyra.invoke('extensions:journal', { id: e.id }).then((j) => setJournaux((x) => ({ ...x, [e.id]: j })))
            }}
            surChangement={() => void rafraichir()}
          />
        ))}
      </div>

      <h2>Limites</h2>
      <div class="card">
        <ul class="limites">
          {LIMITES.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </main>
  )
}

function App() {
  const [privee, setPrivee] = useState(false)
  useEffect(() => {
    void window.lyra.invoke('fenetre:privee').then(setPrivee, () => setPrivee(true))
  }, [])
  return <Page privee={privee} />
}

render(<App />, document.getElementById('app')!)
