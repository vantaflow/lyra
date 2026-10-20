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
  decoderRoute,
  encoderRoute,
  pastille,
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
  return c.teinte ? <span class={`etiq ${c.teinte}`}>{c.texte}</span> : <>{c.texte}</>
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
            const r = sites[cle]
            const p = pastille(cle)
            return (
              <tr key={cle} class={cle === choisie ? 'on' : undefined} data-site={cle} aria-selected={cle === choisie} onClick={() => ouvrir(cle)}>
                <td>
                  <a class="site-regle" href={encoderRoute(cle)} onClick={(e) => e.stopPropagation()}>
                    <i style={{ background: p.couleur }}>{p.lettre}</i>
                    {cle}
                  </a>
                </td>
                <td><Valeur c={celluleBoucliers(r)} /></td>
                <td><Valeur c={celluleCookies(r)} /></td>
                <td><Valeur c={celluleScripts(r)} /></td>
                <td><Valeur c={celluleExtensions(r)} /></td>
                <td><Valeur c={celluleZoom(r)} /></td>
                <td><Valeur c={celluleDnd(r)} /></td>
                <td><Valeur c={celluleStyle(r)} /></td>
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
function Detail({ cle, regle, existe, focus }: { cle: string; regle: Regle; existe: boolean; focus: string | null }) {
  const style = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (focus === null) return
    style.current?.scrollIntoView?.({ block: 'center' })
    style.current?.focus({ preventScroll: true })
  }, [focus, cle])

  const regler = (champs: Champs): void => void ecrire(cle, champs)

  const boucliers: Boucliers = regle.boucliers === false || regle.boucliers === 'desactives' ? 'desactives' : regle.boucliers === 'strict' ? 'strict' : 'standard'
  const reglerBoucliers = (v: Boucliers): void => {
    // Niveau mémorisé pour la réactivation (comme le bouton des Boucliers) ; sans objet quand un niveau est choisi.
    if (v === 'desactives') regler({ boucliers: v, ...(boucliers === 'strict' ? { bouclierAvant: 'strict' as const } : {}) })
    else regler({ boucliers: v, bouclierAvant: null })
  }

  const notifications: Notifications = regle.permissions?.notifications ?? 'demander'
  const reglerNotifications = async (v: Notifications): Promise<void> => {
    if (v !== 'demander') return ecrire(cle, { permissions: { notifications: v } })
    // La fusion des réglages n'enlève pas une clé : on retire le bloc, puis on réécrit les autres décisions.
    const { notifications: _n, ...autres } = regle.permissions ?? {}
    await ecrire(cle, { permissions: null })
    if (Object.keys(autres).length > 0) await ecrire(cle, { permissions: autres })
  }

  const chrome = majeurChrome(navigator.userAgent) ?? 0
  const ua = regle.ua ?? CLE_UA_DEFAUT
  const optionsUa: { id: string; libelle: string }[] = CLES_UA.map((c) => ({ id: c, libelle: libelleUa(c, chrome) }))
  if (!estCleUa(ua)) optionsUa.push({ id: ua, libelle: ua })

  // Liste des scripts : dernier état connu (voir `EditeurScript`), pour que deux modifications rapprochées ne s'écrasent pas.
  const scripts = regle.scriptsPerso ?? []
  const liste = useRef<ScriptPerso[]>(scripts)
  liste.current = scripts
  const ecrireScripts = (l: ScriptPerso[]): void => {
    liste.current = l
    regler({ scriptsPerso: l.length > 0 ? l : null })
  }
  const ajouterScript = (): void => {
    if (liste.current.length >= MAX_SCRIPTS) return
    ecrireScripts([...liste.current, { nom: `Script ${liste.current.length + 1}`, code: '', actif: true }])
  }

  const supprimer = (): void => {
    void window.lyra.invoke('sites:supprimer', cle)
    location.hash = '#/sites'
  }

  return (
    <section class="detail-regle" data-detail={cle} aria-label={`${cle} — détail de la règle`}>
      <Titre>{`${cle} — détail de la règle`}</Titre>
      <div class="card">
        <Ligne reglage="sites.boucliers" titre="Boucliers" aide="Strict ajoute les listes de gênes et bloque les scripts tiers inconnus">
          <Segments valeur={boucliers} options={BOUCLIERS} surChange={reglerBoucliers} />
        </Ligne>
        <Ligne reglage="sites.scriptlets" titre="Scriptlets anti-publicité YouTube" aide="Mis à jour avec les listes ; toujours actifs en Standard et Strict">
          <Interrupteur actif={regle.scriptletsYoutube !== false} libelle="Scriptlets YouTube" surChange={(v) => regler({ scriptletsYoutube: v })} />
        </Ligne>
        <Ligne reglage="sites.cookies" titre="Cookies">
          <Segments valeur={regle.cookies ?? 'tous'} options={COOKIES} surChange={(v) => regler({ cookies: v })} />
        </Ligne>
        <Ligne reglage="sites.lectureAuto" titre="Lecture automatique des vidéos">
          <Segments valeur={regle.lectureAuto ?? 'autoriser'} options={LECTURE} surChange={(v) => regler({ lectureAuto: v })} />
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
        <Ligne reglage="sites.dnd" titre="Ne pas déranger : laisser passer les notifications de ce site" aide="Exception au mode">
          <Interrupteur actif={regle.exceptionDnd === true} libelle="Exception Ne pas déranger" surChange={(v) => regler({ exceptionDnd: v ? true : null })} />
        </Ligne>
        <Ligne reglage="sites.ua" titre="Identité du navigateur (user-agent)">
          <Selecteur
            valeur={ua}
            options={optionsUa}
            libelle="Identité du navigateur"
            surChange={(v) => v !== ua && regler({ ua: v === CLE_UA_DEFAUT ? null : (v as CleUa) })}
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
          {scripts.map((s, i) => (
            <EditeurScript
              key={i}
              script={s}
              surChange={(n) => ecrireScripts(liste.current.map((x, j) => (j === i ? n : x)))}
              surSupprimer={() => ecrireScripts(liste.current.filter((_, j) => j !== i))}
            />
          ))}
          <button class="btn ajouter-script" type="button" disabled={scripts.length >= MAX_SCRIPTS} onClick={ajouterScript}>
            Ajouter un script…
          </button>
        </div>
      </div>
      <div class="pied-detail">
        <button class="btn danger" type="button" id="supprimer-regle" disabled={!existe} onClick={supprimer}>
          Supprimer
        </button>
      </div>
    </section>
  )
}

/** Formulaire « Nouvelle règle » : une origine, un hôte ou un motif `*.hôte`. */
function NouvelleRegle({ existantes, fermer }: { existantes: Record<string, Regle>; fermer: () => void }) {
  const [saisie, setSaisie] = useState('')
  const [erreur, setErreur] = useState('')
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => champ.current?.focus(), [])
  const creer = async (): Promise<void> => {
    const cle = cleCanonique(saisie.trim())
    if (!cle) {
      setErreur('Entrez une origine (https://exemple.fr), un hôte (exemple.fr) ou un motif (*.exemple.fr).')
      return
    }
    // Une règle existante n'est pas écrasée : on ouvre son détail.
    if (!Object.hasOwn(existantes, cle)) await ecrire(cle, { boucliers: 'standard' })
    fermer()
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
          onInput={(e) => {
            setSaisie((e.currentTarget as HTMLInputElement).value)
            setErreur('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void creer()
            else if (e.key === 'Escape') fermer()
          }}
        />
        <button class="btn pri" type="button" id="creer-regle" onClick={() => void creer()}>
          Créer
        </button>
        <button class="btn" type="button" onClick={fermer}>
          Annuler
        </button>
        {erreur && (
          <span class="hint erreur" role="alert">
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
  useEffect(() => {
    void window.lyra.invoke('sites:lister').then(setSites)
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
        <button class="btn pri" type="button" id="nouvelle-regle" data-reglage="sites.nouvelle" onClick={() => setCreation(true)}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Nouvelle règle
        </button>
      </div>
      {sites && (
        <>
          {creation && <NouvelleRegle existantes={sites} fermer={() => setCreation(false)} />}
          <Tableau sites={sites} cles={cles} choisie={cible?.cle ?? null} />
          {cible && <Detail key={cible.cle} cle={cible.cle} regle={sites[cible.cle] ?? {}} existe={Object.hasOwn(sites, cible.cle)} focus={cible.style ? hash : null} />}
        </>
      )}
    </>
  )
}
