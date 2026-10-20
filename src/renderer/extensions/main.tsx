import { render } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import type { CandidatAmo, InfoExtension, JournalExtension, ProgressionFile, ResultatFile, ResultatInstallation, Settings } from '../../shared/types'
import '../ui/theme.css'
import { demarrerTheme } from '../ui/themeVivant'
import './extensions.css'
import { depuis, ETAT_FILE, etatTexte, hoteDe, LIMITES, lignesJournal, origineTexte, porteeTexte, resumeFile, sitesExclus } from './texte'

/** Couleurs des pastilles du design (Extensions.dc.html), attribuées d'après l'identifiant. */
const COULEURS = ['#B5452F', '#3A3A46', '#2D5BD1', '#1F6FB2', '#1E7F6C', '#8A8AA6']
const couleurDe = (id: string): string => COULEURS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % COULEURS.length]

type Mode = 'journal' | 'sites'

const MAGASIN_FILE = { chrome: 'Chrome Web Store', edge: 'À installer à la main (Edge)', firefox: 'addons.mozilla.org', inconnu: 'À installer à la main (origine inconnue)' } as const

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
  /** Fenêtre privée (ou inconnue) : actions désactivées. */
  bloque: boolean
}) {
  const { e, journal, mode, bloque } = p
  const [saisie, setSaisie] = useState('')
  const [refus, setRefus] = useState('')
  const [refusOptions, setRefusOptions] = useState('')
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
  const options = async (): Promise<void> => {
    setRefusOptions('')
    const ok = await window.lyra.invoke('extensions:options', { id: e.id })
    if (!ok) setRefusOptions("La page d'options n'a pas pu s'ouvrir (extension désactivée, ou fenêtre privée).")
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

  // Boutons de ligne comme le design (Extensions.dc.html) : Options · Sites · Journal, et « Replier » à la place de Journal
  // quand la ligne est dépliée ; une extension incompatible n'a que Journal et Supprimer. « Supprimer » n'est pas dans le
  // design d'une ligne ordinaire : il reste accessible, mais seulement dans la ligne dépliée.
  const boutons = (
    <>
      {e.aOptions && !incompatible && (
        <button class="btn" type="button" disabled={bloque} onClick={() => void options()}>
          Options
        </button>
      )}
      {!incompatible && (
        <button class="btn" type="button" disabled={bloque} aria-pressed={mode === 'sites'} onClick={() => p.surMode(mode === 'sites' ? undefined : 'sites')}>
          Sites
        </button>
      )}
      <button class="btn" type="button" onClick={() => p.surMode(ouverte ? undefined : 'journal')}>
        {ouverte ? 'Replier' : 'Journal'}
      </button>
      {(incompatible || ouverte) && (
        <button class="btn danger" type="button" disabled={bloque} onClick={() => void supprimer()}>
          Supprimer
        </button>
      )}
      {!incompatible && (
        <button class={`tg ${e.active ? 'on' : 'off'}`} type="button" role="switch" aria-checked={e.active} aria-label={`Activer ${e.nom}`} disabled={bloque} onClick={() => void interrupteur()}>
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
        {refusOptions && (
          <span class="hint" role="alert">
            {refusOptions}
          </span>
        )}
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
                <button class="btn" type="button" disabled={bloque} onClick={() => void regle(o, true)}>
                  Réactiver
                </button>
              </div>
            ))}
            <div class="ligne">
              <label class="libelle" for={`site-${e.id}`}>
                Site à exclure
              </label>
              <input id={`site-${e.id}`} class="inp" type="text" placeholder="youtube.com" disabled={bloque} value={saisie} onInput={(ev) => setSaisie((ev.target as HTMLInputElement).value)} onKeyDown={(ev) => ev.key === 'Enter' && void exclure()} />
              <button class="btn" type="button" disabled={bloque} onClick={() => void exclure()}>
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

function Page({ privee }: { privee: boolean | undefined }) {
  // Fenêtre privée, ou pas encore connue : aucune action (installer, activer, supprimer, règles, mise à jour).
  const bloque = privee !== false
  const [liste, setListe] = useState<InfoExtension[]>([])
  const [journaux, setJournaux] = useState<Record<string, JournalExtension | undefined>>({})
  const [reglages, setReglages] = useState<Settings | null>(null)
  const [ouvertes, setOuvertes] = useState<Record<string, Mode | undefined>>({})
  const [cws, setCws] = useState('')
  const [amo, setAmo] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [retour, setRetour] = useState<Retour | null>(null)
  const [verifiees, setVerifiees] = useState<string | undefined>(undefined)
  const [progressionFile, setProgressionFile] = useState<ProgressionFile | null>(null)
  const [resultatFile, setResultatFile] = useState<ResultatFile | null>(null)

  const enAttente = reglages?.import.extensionsEnAttente ?? []

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

  // Règles par site : `settings:changed` les omet (`sites: {}`) ; elles ont leur canal `sites:*`.
  const [sites, setSites] = useState<Settings['sites']>({})
  useEffect(() => {
    void window.lyra.invoke('sites:lister').then(setSites)
    return window.lyra.on('sites:changed', setSites)
  }, [])

  // File d'import (réinstallation des extensions d'un autre navigateur) : progression puis résultat par extension.
  useEffect(() => {
    const a = window.lyra.on('extensions:progressionFile', (p) => {
      setResultatFile(null)
      setProgressionFile(p)
    })
    const b = window.lyra.on('extensions:finFile', (r) => {
      setProgressionFile(null)
      setResultatFile(r)
      void rafraichir()
    })
    return () => {
      a()
      b()
    }
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
  // « Installer quand même » : l'utilisateur confirme une extension imposée ; le processus principal relit et réécrit la file.
  const confirmerImposee = async (e: { id: string; magasin: string }): Promise<void> => {
    setOccupe(true)
    try {
      setResultatFile(await window.lyra.invoke('extensions:consommerFile', { confirmees: [`${e.magasin}:${e.id}`] }))
      await rafraichir()
    } catch (err) {
      setRetour({ texte: err instanceof Error ? err.message : String(err) })
    } finally {
      setOccupe(false)
    }
  }
  // « Tout réinstaller » : le processus principal lit la file des réglages ; aucune entrée imposée n'est confirmée.
  const reinstaller = async (): Promise<void> => {
    setOccupe(true)
    try {
      setResultatFile(await window.lyra.invoke('extensions:consommerFile'))
      await rafraichir()
    } catch (err) {
      setRetour({ texte: err instanceof Error ? err.message : String(err) })
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
      {privee === true && <div class="bandeau">Les extensions ne s'exécutent pas en fenêtre privée.</div>}
      <div class="entete">
        <div>
          <h1>Extensions</h1>
          <p>Chrome et Firefox, côte à côte. Ce qui ne marche pas est dit, pas caché.</p>
        </div>
        <button class="btn" type="button" disabled={occupe || bloque} onClick={() => void toutMettreAJour()}>
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
          <input id="cws" class="inp" type="text" disabled={bloque} placeholder="Identifiant ou adresse chromewebstore.google.com/detail/…" value={cws} onInput={(e) => setCws((e.target as HTMLInputElement).value)} onKeyDown={touche(() => cws.trim() && void installer({ source: cws.trim() }))} />
          <button class="btn pri" type="button" disabled={occupe || bloque || !cws.trim()} onClick={() => void installer({ source: cws.trim() })}>
            Installer
          </button>
        </div>
        <div class="row">
          <span class="tag fixe firefox">Firefox</span>
          <label for="amo" class="libelle">
            Nom ou adresse addons.mozilla.org
          </label>
          <input id="amo" class="inp" type="text" disabled={bloque} placeholder="Nom ou adresse addons.mozilla.org/fr/firefox/addon/…" value={amo} onInput={(e) => setAmo((e.target as HTMLInputElement).value)} onKeyDown={touche(() => amo.trim() && void installer({ source: amo.trim() }))} />
          <button class="btn pri" type="button" disabled={occupe || bloque || !amo.trim()} onClick={() => void installer({ source: amo.trim() })}>
            Installer
          </button>
        </div>
        <div class="row">
          <span class="tag fixe fichier">Fichier</span>
          <span class="fichier-texte">
            Un fichier <strong>.crx</strong>, <strong>.zip</strong> ou <strong>.xpi</strong>, ou un dossier d'extension en développement
          </span>
          {window.lyra.plateforme !== 'darwin' && (
            <button class="btn" type="button" disabled={occupe || bloque} onClick={() => void installer({ choisir: 'dossier' })}>
              Dossier…
            </button>
          )}
          <button class="btn" type="button" disabled={occupe || bloque} onClick={() => void installer({ choisir: 'fichier' })}>
            Choisir…
          </button>
        </div>
      </div>

      {enAttente.length > 0 && !progressionFile && (
        <div class="card" role="region" aria-label="Extensions importées en attente">
          <div class="row">
            <strong>
              {enAttente.length} {enAttente.length > 1 ? 'extensions importées attendent' : 'extension importée attend'} d'être réinstallée{enAttente.length > 1 ? 's' : ''}
            </strong>
            <button class="btn pri" type="button" disabled={occupe || bloque} onClick={() => void reinstaller()}>
              Tout réinstaller
            </button>
          </div>
          {enAttente.map((e) => (
            <div class="row" key={`${e.magasin}:${e.id}`}>
              <div class="corps retour">
                <span>
                  <strong>{e.nom}</strong> <span class="hint">{MAGASIN_FILE[e.magasin]}{e.actif ? '' : ' · désactivée'}</span>
                </span>
                {e.imposee && <span class="hint">Imposée par une règle du navigateur d'origine : installée seulement si tu le confirmes.</span>}
              </div>
              {e.imposee && (
                <button class="btn" type="button" disabled={occupe || bloque} aria-label={`Installer quand même ${e.nom}`} onClick={() => void confirmerImposee(e)}>
                  Installer quand même
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {progressionFile && (
        <div class="card" role="status">
          <div class="row">
            <span>
              Réinstallation depuis l'import : {progressionFile.index + 1} sur {progressionFile.total} — {progressionFile.nom}
            </span>
          </div>
        </div>
      )}
      {resultatFile && resultatFile.resultats.length > 0 && (
        <div class="card" role="status" aria-label="Réinstallation depuis l'import">
          <div class="row">
            <strong>{resumeFile(resultatFile)}</strong>
          </div>
          {resultatFile.resultats.map((r) => (
            <div class="row" key={`${r.entree.magasin}:${r.entree.id}`}>
              <div class="corps retour">
                <span>
                  <strong>{r.entree.nom}</strong> <span class="hint">{ETAT_FILE[r.etat]}</span>
                </span>
                {r.raison && <span class="hint">{r.raison}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

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
                  <button class="btn" type="button" disabled={occupe || bloque} onClick={() => void installer({ source: c.slug })}>
                    Installer celle-ci
                  </button>
                </div>
              ))}
              {retour.chromeId && (
                <div class="candidat">
                  <span>Une version Chrome de {retour.chromeId.nom} existe sur le Chrome Web Store.</span>
                  <button class="btn" type="button" disabled={occupe || bloque} onClick={() => void installer({ source: retour.chromeId!.id })}>
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
            sites={sites}
            mode={ouvertes[e.id]}
            surMode={(m) => {
              setOuvertes((o) => ({ ...o, [e.id]: m }))
              if (m === 'journal') void window.lyra.invoke('extensions:journal', { id: e.id }).then((j) => setJournaux((x) => ({ ...x, [e.id]: j })))
            }}
            surChangement={() => void rafraichir()}
            bloque={bloque}
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
  const [privee, setPrivee] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    void window.lyra.invoke('fenetre:privee').then(setPrivee, () => setPrivee(true))
  }, [])
  return <Page privee={privee} />
}

demarrerTheme()
render(<App />, document.getElementById('app')!)
