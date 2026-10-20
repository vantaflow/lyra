import { useEffect, useRef, useState } from 'preact/hooks'
import type { RegleSite, ScriptPerso } from '../../shared/types'
import { CLES_UA, CLE_UA_DEFAUT, estCleUa, libelleUa, majeurChrome, type CleUa } from '../../shared/ua-profils'
import { cleCanonique } from '../../main/settings/sites'
import { EditeurCode, EditeurScript } from './EditeurScript'
import { Interrupteur, Ligne, Segments, Selecteur, Titre } from './controles'
import {
  celluleBoucliers,
  celluleCookies,
  celluleDnd,
  celluleExtensions,
  celluleScripts,
  celluleStyle,
  celluleZoom,
  boucliersHerites,
  decoderRoute,
  effective,
  encoderRoute,
  heritage,
  heritee,
  idZoom,
  nomScriptLibre,
  optionsZoom,
  pastille,
  regleInitiale,
  siteDeSaisie,
  valeurAEcrire,
  vientDHeritage,
  zoomDepuisId,
  type Cellule
} from './sitesCellules'
import './sections.css'
import './sites.css'

type Regle = RegleSite
type Champs = { [C in keyof RegleSite]?: RegleSite[C] | null }
type Boucliers = 'desactives' | 'standard' | 'strict'
type Notifications = 'demander' | 'autoriser' | 'refuser'

const MAX_SCRIPTS = 50

const BOUCLIERS: { id: Boucliers; libelle: string }[] = [
  { id: 'desactives', libelle: 'Désactivés' },
  { id: 'standard', libelle: 'Standard' },
  { id: 'strict', libelle: 'Strict' }
]
const COOKIES: { id: NonNullable<Regle['cookies']>; libelle: string }[] = [
  { id: 'tous', libelle: 'Tous' },
  { id: 'premiere-partie', libelle: '1re partie' },
  { id: 'bloques', libelle: 'Bloqués' },
  { id: 'session', libelle: 'Session seulement' }
]
const SCRIPTS: { id: NonNullable<Regle['scripts']>; libelle: string }[] = [
  { id: 'autorises', libelle: 'Autorisés' },
  { id: 'bloques', libelle: 'Bloqués' }
]
const LECTURE: { id: NonNullable<Regle['lectureAuto']>; libelle: string }[] = [
  { id: 'autoriser', libelle: 'Autoriser' },
  { id: 'sans-son', libelle: 'Sans le son' },
  { id: 'bloquer', libelle: 'Bloquer' }
]
const NOTIFICATIONS: { id: Notifications; libelle: string }[] = [
  { id: 'demander', libelle: 'Demander' },
  { id: 'autoriser', libelle: 'Autoriser' },
  { id: 'refuser', libelle: 'Refuser' }
]

const ecrire = (cle: string, regle: Champs): Promise<void> => window.lyra.invoke('sites:ecrire', { cle, regle })

/** Étiquette colorée (vert, rouge, violet : couleurs du design) ou texte brut. */
function Valeur({ c }: { c: Cellule }) {
  const valeur = c.teinte ? <span class={`etiq ${c.teinte}`}>{c.texte}</span> : <>{c.texte}</>
  return c.herite ? (
    <>
      {valeur} <span class="herite">hérité</span>
    </>
  ) : (
    valeur
  )
}

function Tableau({ sites, cles, choisie }: { sites: Record<string, Regle>; cles: string[]; choisie: string | null }) {
  const ouvrir = (cle: string): void => {
    location.hash = encoderRoute(cle)
  }
  return (
    <div class="card carte-tableau">
      <table class="tableau-sites">
        <thead>
          <tr>
            <th>Site</th>
            <th>Boucliers</th>
            <th>Cookies</th>
            <th>Scripts</th>
            <th>Extensions</th>
            <th>Zoom</th>
            <th>Ne pas déranger</th>
            <th>Style</th>
          </tr>
        </thead>
        <tbody>
          {cles.map((cle) => {
            const propre = sites[cle]
            const r = effective(sites, cle)
            const h = (c: Cellule, champ: Parameters<typeof vientDHeritage>[2]): Cellule => heritee(c, vientDHeritage(propre, r, champ))
            const p = pastille(cle)
            return (
              <tr key={cle} class={cle === choisie ? 'on' : undefined} data-site={cle} aria-current={cle === choisie ? 'true' : undefined} onClick={() => ouvrir(cle)}>
                <td>
                  <a class="site-regle" href={encoderRoute(cle)} onClick={(e) => e.stopPropagation()}>
                    <i style={{ background: p.couleur }}>{p.lettre}</i>
                    {cle}
                  </a>
                </td>
                <td><Valeur c={heritee(celluleBoucliers(r), propre?.boucliers === undefined && boucliersHerites(sites, cle))} /></td>
                <td><Valeur c={h(celluleCookies(r), 'cookies')} /></td>
                <td><Valeur c={h(celluleScripts(r), 'scripts')} /></td>
                <td><Valeur c={celluleExtensions(r)} /></td>
                <td><Valeur c={h(celluleZoom(r), 'zoom')} /></td>
                <td><Valeur c={h(celluleDnd(r), 'exceptionDnd')} /></td>
                <td><Valeur c={h(celluleStyle(r), 'style')} /></td>
              </tr>
            )
          })}
          {cles.length === 0 && (
            <tr>
              <td colSpan={8} class="aucune-regle" id="aucune-regle">
                Aucune règle : tous les sites suivent les réglages généraux.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Détail d'une règle (sans règle enregistrée : ses valeurs par défaut, la première écriture la crée). */
function Detail({ cle, sites, focus, privee }: { cle: string; sites: Record<string, Regle>; focus: string | null; privee: boolean }) {
  const regle: Regle = sites[cle] ?? {}
  const existe = Object.hasOwn(sites, cle)
  // `eff` : ce qui s'applique au site (règle propre puis règles plus larges) ; `her` : ce qui s'appliquerait sans la règle propre.
  const eff = effective(sites, cle)
  const her = heritage(sites, cle)
  const herite = (champ: Parameters<typeof vientDHeritage>[2]): boolean => vientDHeritage(regle, eff, champ)
  const style = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (focus === null) return
    style.current?.scrollIntoView?.({ block: 'center' })
    style.current?.focus({ preventScroll: true })
  }, [focus, cle])

  const regler = (champs: Champs): void => void ecrire(cle, champs)

  const boucliers: Boucliers = eff.boucliers
  const reglerBoucliers = (v: Boucliers): void => {
    // Niveau mémorisé pour la réactivation (comme le bouton des Boucliers) ; sans objet quand un niveau est choisi.
    if (v === 'desactives') regler({ boucliers: v, ...(boucliers === 'strict' ? { bouclierAvant: 'strict' as const } : {}) })
    else regler({ boucliers: v, bouclierAvant: null })
  }
  // Scriptlets YouTube : éteints par la règle ; sans objet quand les Boucliers du site sont désactivés.
  const scriptletsActifs = boucliers !== 'desactives' && eff.scriptletsYoutube !== false
  const reglerScriptlets = (v: boolean): void => regler({ scriptletsYoutube: valeurAEcrire(v, her.scriptletsYoutube !== false) })

  const cookies = eff.cookies ?? 'tous'
  const scripts = eff.scripts ?? 'autorises'
  const lecture = eff.lectureAuto ?? 'autoriser'

  // « Par défaut » ou la valeur héritée retire `zoom` de la règle (écrit `null`) ; choisir le zoom déjà en place n'écrit rien.
  const reglerZoom = (id: string): void => {
    const zoom = zoomDepuisId(id)
    if (zoom === undefined || id === idZoom(eff.zoom)) return
    regler({ zoom: zoom === null || zoom === her.zoom ? null : zoom })
  }

  const notifications: Notifications = eff.permissions?.notifications ?? 'demander'
  const reglerNotifications = async (v: Notifications): Promise<void> => {
    const parDefaut: Notifications = her.permissions?.notifications ?? 'demander'
    // « Demander » n'est pas une décision enregistrable : il ne s'obtient qu'en retirant la décision.
    if (v !== parDefaut && v === 'demander') return
    if (v !== parDefaut) return ecrire(cle, { permissions: { notifications: v as 'autoriser' | 'refuser' } })
    // La fusion des réglages n'enlève pas une clé : on retire le bloc, puis on réécrit les autres décisions.
    const { notifications: _n, ...autres } = regle.permissions ?? {}
    await ecrire(cle, { permissions: null })
    if (Object.keys(autres).length > 0) await ecrire(cle, { permissions: autres })
  }

  const chrome = majeurChrome(navigator.userAgent) ?? 0
  const ua = eff.ua ?? CLE_UA_DEFAUT
  const optionsUa: { id: string; libelle: string }[] = CLES_UA.map((c) => ({ id: c, libelle: libelleUa(c, chrome) }))
  if (!estCleUa(ua)) optionsUa.push({ id: ua, libelle: ua })

  // Liste des scripts : dernier état connu (voir `EditeurScript`), pour que deux modifications rapprochées ne s'écrasent pas.
  const scriptsPerso = regle.scriptsPerso ?? []
  const liste = useRef<ScriptPerso[]>(scriptsPerso)
  liste.current = scriptsPerso
  const ecrireScripts = (l: ScriptPerso[]): void => {
    liste.current = l
    regler({ scriptsPerso: l.length > 0 ? l : null })
  }
  const ajouterScript = (): void => {
    if (liste.current.length >= MAX_SCRIPTS) return
    ecrireScripts([...liste.current, { nom: nomScriptLibre(liste.current.map((x) => x.nom)), code: '', actif: true }])
  }

  const supprimer = (): void => {
    void window.lyra.invoke('sites:supprimer', cle)
    location.hash = '#/sites'
    document.getElementById('nouvelle-regle')?.focus()
  }

  return (
    <section class="detail-regle" data-detail={cle} aria-label={`${cle} — détail de la règle`}>
      <Titre>{`${cle} — détail de la règle`}</Titre>
      {privee && (
        <p class="hint" id="regles-privee" role="note">
          Les règles par site ne peuvent pas être modifiées depuis une fenêtre privée.
        </p>
      )}
      <fieldset class="card sans-cadre" disabled={privee} aria-describedby={privee ? 'regles-privee' : undefined}>
        <Ligne reglage="sites.boucliers" titre="Boucliers" aide="Strict ajoute les listes de gênes et bloque les scripts tiers inconnus" herite={regle.boucliers === undefined && boucliersHerites(sites, cle)}>
          <Segments valeur={boucliers} options={BOUCLIERS} surChange={reglerBoucliers} />
        </Ligne>
        <Ligne reglage="sites.scriptlets" titre="Scriptlets anti-publicité YouTube" aide="Mis à jour avec les listes ; inactifs quand les Boucliers du site sont désactivés" herite={herite('scriptletsYoutube')}>
          <Interrupteur actif={scriptletsActifs} inerte={boucliers === 'desactives'} libelle="Scriptlets YouTube" surChange={reglerScriptlets} />
        </Ligne>
        <Ligne reglage="sites.cookies" titre="Cookies" herite={herite('cookies')}>
          <Segments valeur={cookies} options={COOKIES} surChange={(v) => regler({ cookies: valeurAEcrire(v, her.cookies ?? 'tous') })} />
        </Ligne>
        <Ligne reglage="sites.scripts" titre="Scripts" aide="Bloqués : aucun script de la page ne s'exécute" herite={herite('scripts')}>
          <Segments valeur={scripts} options={SCRIPTS} surChange={(v) => regler({ scripts: valeurAEcrire(v, her.scripts ?? 'autorises') })} />
        </Ligne>
        <Ligne reglage="sites.zoom" titre="Zoom" aide="Appliqué à chaque page du site" herite={herite('zoom')}>
          <Selecteur valeur={idZoom(eff.zoom)} options={optionsZoom(eff.zoom)} libelle="Zoom" surChange={reglerZoom} />
        </Ligne>
        <Ligne reglage="sites.lectureAuto" titre="Lecture automatique des vidéos" herite={herite('lectureAuto')}>
          <Segments valeur={lecture} options={LECTURE} surChange={(v) => regler({ lectureAuto: valeurAEcrire(v, her.lectureAuto ?? 'autoriser') })} />
        </Ligne>
        <Ligne reglage="sites.notifications" titre="Notifications">
          <Segments valeur={notifications} options={NOTIFICATIONS} surChange={(v) => void reglerNotifications(v)} />
        </Ligne>
        <Ligne reglage="sites.extensions" titre="Extensions autorisées sur ce site" aide="Les autres ne voient pas la page">
          <span class="bientot">Bientôt</span>
          <button class="btn modifier" type="button" disabled>
            Modifier
          </button>
        </Ligne>
        <Ligne reglage="sites.dnd" titre="Ne pas déranger : laisser passer les notifications de ce site" aide="Exception au mode" herite={herite('exceptionDnd')}>
          <Interrupteur actif={eff.exceptionDnd === true} libelle="Exception Ne pas déranger" surChange={(v) => regler({ exceptionDnd: valeurAEcrire(v, her.exceptionDnd === true) })} />
        </Ligne>
        <Ligne reglage="sites.ua" titre="Identité du navigateur (user-agent)" herite={herite('ua')}>
          <Selecteur
            valeur={ua}
            options={optionsUa}
            libelle="Identité du navigateur"
            surChange={(v) => v !== ua && regler({ ua: valeurAEcrire(v, her.ua ?? CLE_UA_DEFAUT) as CleUa | null })}
          />
        </Ligne>
        <div class="row colonne" data-reglage="sites.style" tabIndex={-1}>
          <div class="lbl">
            <span>Style personnalisé</span>
            <span class="hint">Appliqué à chaque page du site, avant son premier rendu</span>
          </div>
          <EditeurCode id="style-perso" champ={style} valeur={regle.style ?? ''} libelle="Style personnalisé" sauver={(t) => regler({ style: t === '' ? null : t })} />
        </div>
        <div class="row colonne" data-reglage="sites.scriptsPerso" tabIndex={-1}>
          <div class="lbl">
            <span>Script personnalisé</span>
            <span class="hint">Exécuté au chargement, dans un monde isolé</span>
          </div>
          {scriptsPerso.map((s, i) => (
            <EditeurScript
              key={i}
              script={s}
              surChange={(n) => ecrireScripts(liste.current.map((x, j) => (j === i ? n : x)))}
              surSupprimer={() => ecrireScripts(liste.current.filter((_, j) => j !== i))}
            />
          ))}
          <button class="btn ajouter-script" type="button" disabled={scriptsPerso.length >= MAX_SCRIPTS} onClick={ajouterScript}>
            Ajouter un script…
          </button>
        </div>
      </fieldset>
      <div class="pied-detail">
        <button class="btn danger" type="button" id="supprimer-regle" disabled={!existe || privee} onClick={supprimer}>
          Supprimer
        </button>
      </div>
    </section>
  )
}

/** Formulaire « Nouvelle règle » : une origine, un hôte ou un motif `*.hôte`. */
function NouvelleRegle({ existantes, fermer }: { existantes: Record<string, Regle>; fermer: (focus: 'bouton' | 'titre') => void }) {
  const [saisie, setSaisie] = useState('')
  const [erreur, setErreur] = useState('')
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => champ.current?.focus(), [])
  const creer = async (): Promise<void> => {
    const cle = cleCanonique(siteDeSaisie(saisie))
    if (!cle) {
      setErreur('Entrez une origine (https://exemple.fr), un hôte (exemple.fr) ou un motif (*.exemple.fr).')
      return
    }
    // Une règle existante n'est pas écrasée : on ouvre son détail.
    // La règle écrite reprend le niveau déjà en vigueur sur le site (un motif `*.` Strict reste Strict).
    if (!Object.hasOwn(existantes, cle)) await ecrire(cle, regleInitiale(existantes, cle))
    fermer('titre')
    location.hash = encoderRoute(cle)
  }
  return (
    <div class="card nouvelle-regle">
      <div class="row wrap">
        <label class="lbl" for="nouvelle-regle-site">
          <span>Site</span>
          <span class="hint">Origine, hôte ou motif commençant par « *. »</span>
        </label>
        <input
          id="nouvelle-regle-site"
          ref={champ}
          class="champ"
          type="text"
          spellcheck={false}
          placeholder="exemple.fr, https://exemple.fr:8443 ou *.exemple.fr"
          value={saisie}
          aria-invalid={erreur !== ''}
          aria-describedby={erreur ? 'erreur-nouvelle-regle' : undefined}
          onInput={(e) => {
            setSaisie((e.currentTarget as HTMLInputElement).value)
            setErreur('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void creer()
            else if (e.key === 'Escape') fermer('bouton')
          }}
        />
        <button class="btn pri" type="button" id="creer-regle" onClick={() => void creer()}>
          Créer
        </button>
        <button class="btn" type="button" onClick={() => fermer('bouton')}>
          Annuler
        </button>
        {erreur && (
          <span class="hint erreur" id="erreur-nouvelle-regle" role="alert">
            {erreur}
          </span>
        )}
      </div>
    </div>
  )
}

export function Sites() {
  const [sites, setSites] = useState<Record<string, Regle> | null>(null)
  const [hash, setHash] = useState(location.hash)
  const [creation, setCreation] = useState(false)
  const [privee, setPrivee] = useState(false)
  useEffect(() => {
    void window.lyra.invoke('sites:lister').then(setSites)
    void window.lyra.invoke('fenetre:privee').then(setPrivee, () => setPrivee(true))
    const arret = window.lyra.on('sites:changed', setSites)
    const maj = (): void => setHash(location.hash)
    window.addEventListener('hashchange', maj)
    maj()
    return () => {
      arret()
      window.removeEventListener('hashchange', maj)
    }
  }, [])

  const cible = decoderRoute(hash)
  const cles = sites ? Object.keys(sites).sort((a, b) => a.localeCompare(b, 'fr')) : []
  return (
    <>
      <div class="entete">
        <div class="bloc-titre">
          <h1 data-reglage="sites" tabIndex={-1}>
            Règles par site
          </h1>
          <p class="sous-titre">Chaque site peut avoir ses propres boucliers, cookies, scripts, extensions, zoom, style et exceptions. La règle la plus précise gagne.</p>
        </div>
        <button class="btn pri" type="button" id="nouvelle-regle" data-reglage="sites.nouvelle" disabled={privee} onClick={() => setCreation(true)}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Nouvelle règle
        </button>
      </div>
      {sites && (
        <>
          {creation && (
            <NouvelleRegle
              existantes={sites}
              fermer={(focus) => {
                setCreation(false)
                // Le champ disparaît : le focus revient au bouton, ou au titre quand la règle vient d'être ouverte.
                if (focus === 'titre') document.querySelector<HTMLElement>('h1[data-reglage="sites"]')?.focus()
                else document.getElementById('nouvelle-regle')?.focus()
              }}
            />
          )}
          <Tableau sites={sites} cles={cles} choisie={cible?.cle ?? null} />
          {cible && <Detail key={cible.cle} cle={cible.cle} sites={sites} focus={cible.style ? hash : null} privee={privee} />}
        </>
      )}
    </>
  )
}
