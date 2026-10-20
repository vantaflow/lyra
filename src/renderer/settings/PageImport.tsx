import { useEffect, useMemo, useState } from 'preact/hooks'
import type { ProgressionImport, ReponseApercuImport } from '../../shared/ipc'
import type { DemandeImportFichier, EtatSauvegardeAutoIpc, ReponseImportFichier, ResultatExport, TypeFichierImport } from '../../main/export/types'
import { ELEMENTS_IMPORT, JOURS_HISTORIQUE_PAR_DEFAUT, NOMS_NAVIGATEURS, type ElementImport, type NavigateurSource, type ProfilDetecte, type ResultatImport } from '../../main/import/types'
import { messageErreur } from '../ui/messageErreur'
import { Segments, Selecteur } from './controles'
import {
  COULEURS_LOGO,
  NAVIGATEURS_PROPOSES,
  TITRE_ELEMENT,
  accesRefuse,
  elementsCochablesParDefaut,
  etatCarte,
  etiquetteResultat,
  formaterNombre,
  lignesElements,
  resumeResultat
} from './apercuImport'
import './reseau.css'
import './importer.css'

/** Réglages « Importer et exporter » (fidèle à docs/design/project/Importation.dc.html). */

type Source = NavigateurSource | 'fichier'
type Progres = Record<string, Partial<Record<ElementImport, ProgressionImport>>>

const OPTIONS = { fenetre: 'courante' as const, ouvrirMaintenant: false, moteurParDefaut: false, extensionsChoisies: [] as string[] }

const TYPES_FICHIER: Array<{ id: TypeFichierImport; libelle: string }> = [
  { id: 'favoris', libelle: 'Favoris HTML' },
  { id: 'historique', libelle: 'Historique CSV' },
  { id: 'ciel', libelle: 'Le ciel JSON' },
  { id: 'reglages', libelle: 'Réglages JSON' },
  { id: 'paquet', libelle: 'Paquet .lyra' }
]

const MESSAGES_IMPORT_FICHIER: Partial<Record<Exclude<ReponseImportFichier, { ok: true }>['erreur'], string>> = {
  annule: 'Aucun fichier choisi.'
}

function Resume({ resultat }: { resultat: ResultatImport }) {
  const lignes = ELEMENTS_IMPORT.filter((e) => resultat[e].etat !== 'ignore')
  return (
    <div class="card" id="resume-import" role="status">
      {lignes.map((e) => {
        const r = resultat[e]
        const tag = etiquetteResultat(e, r)
        return (
          <div class="row" key={e} data-element={e} data-etat={r.etat}>
            <div class="lbl">
              <span>{TITRE_ELEMENT[e]}</span>
              <span class="hint">{r.etat === 'indisponible' ? (r.raison ?? 'Indisponible') : resumeResultat(r)}</span>
              {r.notes.length > 0 && (
                <ul class="notes">
                  {r.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
            <span class={`tag ${tag.classe === 'neutre' ? '' : tag.classe}`}>{tag.texte}</span>
          </div>
        )
      })}
    </div>
  )
}

function Detail({ apercu, resultat }: { apercu?: ReponseApercuImport; resultat?: ResultatImport }) {
  const notes = resultat ? ELEMENTS_IMPORT.filter((e) => resultat[e].notes.length > 0) : []
  return (
    <div class="card detail" id="apercu-detaille">
      {apercu?.extensions && apercu.extensions.length > 0 && (
        <div class="row">
          <div class="lbl">
            <strong>Extensions trouvées</strong>
            <ul class="notes">
              {apercu.extensions.map((x) => (
                <li key={x.id}>
                  {x.nom} — {x.magasin === 'chrome' ? 'Chrome Web Store' : x.magasin === 'edge' ? 'Edge Add-ons' : x.magasin === 'firefox' ? 'addons.mozilla.org' : 'hors magasin'}
                  {x.actif ? '' : ' (désactivée)'}
                  {x.imposee ? ' (imposée par une stratégie)' : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {apercu &&
        ELEMENTS_IMPORT.filter((e) => apercu.indisponibles[e]).map((e) => (
          <div class="row" key={e}>
            <div class="lbl">
              <strong>{TITRE_ELEMENT[e]}</strong>
              <span class="hint">{apercu.indisponibles[e]!.raison}</span>
            </div>
          </div>
        ))}
      {notes.map((e) => (
        <div class="row" key={`n-${e}`}>
          <div class="lbl">
            <strong>{TITRE_ELEMENT[e]} — notes</strong>
            <ul class="notes">
              {resultat![e].notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      ))}
      {!apercu?.extensions?.length && !notes.length && !(apercu && ELEMENTS_IMPORT.some((e) => apercu.indisponibles[e])) && (
        <div class="row">
          <span class="hint">Rien de particulier à signaler pour ce profil.</span>
        </div>
      )}
    </div>
  )
}

export function PageImport() {
  const [profils, setProfils] = useState<ProfilDetecte[] | null>(null)
  const [erreurDetection, setErreurDetection] = useState('')
  const [acces, setAcces] = useState<Set<NavigateurSource>>(new Set())
  const [source, setSource] = useState<Source | null>(null)
  const [profil, setProfil] = useState<ProfilDetecte | null>(null)
  const [apercu, setApercu] = useState<ReponseApercuImport | undefined>()
  const [erreurApercu, setErreurApercu] = useState('')
  const [coches, setCoches] = useState<Set<ElementImport>>(new Set())
  const [detail, setDetail] = useState(false)
  const [idCourant, setIdCourant] = useState<string | null>(null)
  const [progres, setProgres] = useState<Progres>({})
  const [resultats, setResultats] = useState<Record<string, ResultatImport>>({})
  const [dernier, setDernier] = useState<ResultatImport | undefined>()
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null)

  // Évènements : stockés par identifiant, lus pour l'import courant (aucune course avec la réponse de `import:lancer`).
  useEffect(() => {
    const a = window.lyra.on('import:progression', (p) => setProgres((s) => ({ ...s, [p.id]: { ...s[p.id], [p.element]: p } })))
    const b = window.lyra.on('import:termine', (t) => setResultats((s) => ({ ...s, [t.id]: t.resultat })))
    return () => {
      a()
      b()
    }
  }, [])

  const detecter = (): void => {
    setErreurDetection('')
    void window.lyra
      .invoke('import:detecter')
      .then((liste) => {
        setProfils(liste)
        // Safari / Orion : un accès refusé par le système ne se voit qu'à la lecture.
        for (const nav of ['safari', 'orion'] as const) {
          const p = liste.find((x) => x.navigateur === nav && x.parDefaut) ?? liste.find((x) => x.navigateur === nav)
          if (!p) continue
          void window.lyra
            .invoke('import:apercu', { profil: p, elements: ['favoris', 'historique'], depuisJours: JOURS_HISTORIQUE_PAR_DEFAUT })
            .then((r) => accesRefuse(r.indisponibles) && setAcces((s) => new Set(s).add(nav)))
            .catch(() => undefined)
        }
        setSource((s) => s ?? NAVIGATEURS_PROPOSES.find((n) => liste.some((p) => p.navigateur === n)) ?? 'fichier')
      })
      .catch((e: unknown) => {
        setProfils([])
        setErreurDetection(messageErreur(e))
      })
  }
  useEffect(detecter, [])

  const profilsDe = (n: NavigateurSource): ProfilDetecte[] => (profils ?? []).filter((p) => p.navigateur === n)

  // Profil par défaut du navigateur choisi.
  useEffect(() => {
    if (!source || source === 'fichier') return setProfil(null)
    const l = profilsDe(source)
    setProfil((p) => (p && l.some((x) => x.chemin === p.chemin) ? p : (l.find((x) => x.parDefaut) ?? l[0] ?? null)))
  }, [source, profils])

  // Aperçu (compteurs) du profil choisi.
  useEffect(() => {
    setApercu(undefined)
    setErreurApercu('')
    setDetail(false)
    if (!profil) return
    let actuel = true
    void window.lyra
      .invoke('import:apercu', { profil, elements: [...ELEMENTS_IMPORT], depuisJours: JOURS_HISTORIQUE_PAR_DEFAUT })
      .then((r) => {
        if (!actuel) return
        setApercu(r)
        setCoches(new Set(elementsCochablesParDefaut(lignesElements({ navigateur: profil.navigateur, profil, apercu: r, jours: JOURS_HISTORIQUE_PAR_DEFAUT }))))
      })
      .catch((e: unknown) => actuel && setErreurApercu(messageErreur(e)))
    return () => {
      actuel = false
    }
  }, [profil?.chemin, profil?.navigateur])

  const lignes = useMemo(() => (profil ? lignesElements({ navigateur: profil.navigateur, profil, apercu, jours: JOURS_HISTORIQUE_PAR_DEFAUT }) : []), [profil, apercu])
  const enCours = idCourant !== null && !resultats[idCourant]
  const resultat = idCourant ? resultats[idCourant] : undefined

  useEffect(() => {
    if (resultat) setDernier(resultat)
  }, [resultat])

  const importer = async (): Promise<void> => {
    if (!profil) return
    setMessage(null)
    setDetail(false)
    setDernier(undefined)
    const elements = ELEMENTS_IMPORT.filter((e) => coches.has(e))
    try {
      const r = await window.lyra.invoke('import:lancer', { profil, elements, depuisJours: JOURS_HISTORIQUE_PAR_DEFAUT, options: OPTIONS })
      if ('id' in r) {
        setIdCourant(r.id)
      } else
        setMessage({ erreur: true, texte: r.erreur === 'en-cours' ? 'Un import est déjà en cours.' : r.erreur === 'prive' ? 'Importer est impossible depuis une fenêtre privée.' : 'Demande d’import invalide.' })
    } catch (e) {
      setMessage({ erreur: true, texte: messageErreur(e) })
    }
  }
  const annuler = (): void => {
    if (idCourant) void window.lyra.invoke('import:annuler', { id: idCourant })
  }

  const nomSource = source && source !== 'fichier' ? NOMS_NAVIGATEURS[source] : ''
  const mesProfils = source && source !== 'fichier' ? profilsDe(source) : []
  const avance = idCourant ? progres[idCourant] : undefined

  return (
    <div class="imp">
      <p class="sous-titre">Apportez tout ce qui compte depuis votre navigateur actuel, ou emportez Lyra ailleurs. Tout se passe sur cet ordinateur.</p>

      {erreurDetection && (
        <p class="alerte" role="alert" id="erreur-detection">
          Impossible de chercher les navigateurs : {erreurDetection}
        </p>
      )}

      <h2 class="etape">1. Depuis quel navigateur</h2>
      <div class="sources" role="group" aria-label="Navigateurs">
        {NAVIGATEURS_PROPOSES.map((n) => {
          const l = profilsDe(n)
          const refus = acces.has(n)
          return (
            <button key={n} class="src" type="button" data-navigateur={n} aria-pressed={source === n} disabled={profils === null || (l.length === 0 && !refus)} onClick={() => setSource(n)}>
              <span class="logo" style={{ background: COULEURS_LOGO[n] }}>
                {NOMS_NAVIGATEURS[n].charAt(0)}
              </span>
              <span class="n">{NOMS_NAVIGATEURS[n]}</span>
              <span class="d">{profils === null ? 'Recherche…' : etatCarte(l, refus)}</span>
            </button>
          )
        })}
        <button class="src" type="button" data-navigateur="fichier" aria-pressed={source === 'fichier'} onClick={() => setSource('fichier')}>
          <span class="logo" style={{ background: COULEURS_LOGO.fichier, fontSize: '20px' }}>
            …
          </span>
          <span class="n">Un fichier</span>
          <span class="d">Favoris HTML, CSV, JSON, paquet .lyra</span>
        </button>
      </div>

      {source === 'fichier' ? (
        <ImportFichier />
      ) : (
        source &&
        profil && (
          <>
            <div class="entete-etape">
              <h2 class="etape" id="titre-quoi">{`2. Quoi importer — ${nomSource}, profil « ${profil.nom} »`}</h2>
              {mesProfils.length > 1 && (
                <Selecteur
                  valeur={profil.chemin}
                  libelle="Profil"
                  options={mesProfils.map((p) => ({ id: p.chemin, libelle: p.nom }))}
                  surChange={(c) => setProfil(mesProfils.find((p) => p.chemin === c) ?? profil)}
                />
              )}
            </div>
            {erreurApercu && (
              <p class="alerte" role="alert">
                Lecture du profil impossible : {erreurApercu}
              </p>
            )}
            <div class="card" id="elements">
              {lignes.map((l) => {
                const p = l.element ? avance?.[l.element] : undefined
                const tag = enCours && p ? { texte: p.phase === 'lecture' ? `Lecture… ${formaterNombre(p.fait)}` : `Écriture… ${formaterNombre(p.fait)}${p.total ? ` / ${formaterNombre(p.total)}` : ''}`, classe: 'neutre' as const } : l.tag
                const id = `i-${l.cle}`
                return (
                  <div class={l.disponible ? 'chk' : 'chk off'} key={l.cle} data-element={l.cle}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={l.element !== undefined && l.disponible && coches.has(l.element)}
                      disabled={!l.disponible || enCours}
                      onChange={(ev) => {
                        const v = (ev.currentTarget as HTMLInputElement).checked
                        setCoches((s) => {
                          const n = new Set(s)
                          if (v) n.add(l.element!)
                          else n.delete(l.element!)
                          return n
                        })
                      }}
                    />
                    <label for={id}>
                      <span>{l.titre}</span>
                      {l.hint && <span class="hint">{l.hint}</span>}
                    </label>
                    <span class={`tag ${tag.classe === 'neutre' ? '' : tag.classe}`}>{tag.texte}</span>
                  </div>
                )
              })}
            </div>
            <div class="actions">
              <button class="btn pri" type="button" id="importer-maintenant" disabled={enCours || coches.size === 0 || !apercu} onClick={() => void importer()}>
                Importer maintenant
              </button>
              <button class="btn" type="button" id="apercu-detaille-btn" aria-expanded={detail} disabled={!apercu && !dernier} onClick={() => setDetail(!detail)}>
                Aperçu détaillé
              </button>
              {enCours && (
                <button class="btn" type="button" id="annuler-import" onClick={annuler}>
                  Annuler
                </button>
              )}
              <span class="hint">{`${nomSource} peut rester ouvert ; Lyra lit une copie. Rien n'est envoyé nulle part.`}</span>
            </div>
            {message && (
              <p class={message.erreur ? 'alerte' : 'info'} role={message.erreur ? 'alert' : 'status'}>
                {message.texte}
              </p>
            )}
            {detail && <Detail apercu={apercu} resultat={dernier} />}
            {resultat && <Resume resultat={resultat} />}
          </>
        )
      )}

      <Exporter />
    </div>
  )
}

function ImportFichier() {
  const [type, setType] = useState<TypeFichierImport>('favoris')
  const [phrase, setPhrase] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [reponse, setReponse] = useState<ReponseImportFichier | null>(null)
  const [erreur, setErreur] = useState('')

  const importer = async (): Promise<void> => {
    setOccupe(true)
    setErreur('')
    setReponse(null)
    try {
      const d: DemandeImportFichier = type === 'paquet' ? { type, phrase } : { type }
      setReponse(await window.lyra.invoke('import:fichier', d))
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <>
      <h2 class="etape" id="titre-quoi">
        2. Quoi importer — un fichier
      </h2>
      <div class="card" id="import-fichier">
        <div class="fichier-types">
          <Segments valeur={type} options={TYPES_FICHIER} surChange={setType} />
        </div>
        {type === 'paquet' && (
          <div class="champ-phrase">
            <label for="phrase-import" class="hint">
              Phrase de passe du paquet
            </label>
            <input id="phrase-import" class="inp" type="password" autocomplete="off" value={phrase} onInput={(ev) => setPhrase((ev.currentTarget as HTMLInputElement).value)} />
          </div>
        )}
      </div>
      <div class="actions">
        <button class="btn pri" type="button" id="choisir-fichier" disabled={occupe} onClick={() => void importer()}>
          Choisir le fichier…
        </button>
        <span class="hint">Lyra lit le fichier sur cet ordinateur ; rien n'est envoyé nulle part.</span>
      </div>
      {erreur && (
        <p class="alerte" role="alert">
          {erreur}
        </p>
      )}
      {reponse && !reponse.ok && (
        <p class={reponse.erreur === 'annule' ? 'info' : 'alerte'} role={reponse.erreur === 'annule' ? 'status' : 'alert'} id="message-fichier">
          {reponse.message || MESSAGES_IMPORT_FICHIER[reponse.erreur] || 'Import impossible.'}
        </p>
      )}
      {reponse?.ok && (
        <>
          <Resume resultat={reponse.resultat} />
          {(reponse.reglages || reponse.cookies > 0) && (
            <p class="info" role="status">
              {reponse.reglages ? 'Réglages appliqués.' : ''} {reponse.cookies > 0 ? `${formaterNombre(reponse.cookies)} cookies restaurés.` : ''}
            </p>
          )}
          {reponse.avertissements.map((a, i) => (
            <p class="alerte" role="status" key={i}>
              {a}
            </p>
          ))}
        </>
      )}
    </>
  )
}

type CanalExport = 'export:favoris' | 'export:historique' | 'export:ciel' | 'export:reglages'

const EXPORTS: Array<{ canal: CanalExport; titre: string; aide: string }> = [
  { canal: 'export:favoris', titre: 'Favoris', aide: 'Fichier HTML lisible par tous les navigateurs' },
  { canal: 'export:historique', titre: 'Historique', aide: 'CSV (date, titre, adresse, visites)' },
  { canal: 'export:ciel', titre: 'Le ciel', aide: 'Constellations, étoiles et épingles en JSON ; réimportable' },
  { canal: 'export:reglages', titre: 'Réglages, règles par site, raccourcis', aide: 'JSON, le même que « Exporter les réglages »' }
]

const jourHeure = (t: number): string => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Exporter() {
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [paquet, setPaquet] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [phraseAuto, setPhraseAuto] = useState('')
  const [confirmationAuto, setConfirmationAuto] = useState('')
  const [auto, setAuto] = useState(false)
  const [etat, setEtat] = useState<EtatSauvegardeAutoIpc | null>(null)

  useEffect(() => {
    void window.lyra.invoke('export:sauvegardeEtat').then(setEtat).catch(() => undefined)
  }, [])

  const bilan = (r: ResultatExport, quoi: string): void => {
    if (r.ok) setMessage({ erreur: false, texte: `${quoi} : ${formaterNombre(r.compte)} élément${r.compte >= 2 ? 's' : ''} écrit${r.compte >= 2 ? 's' : ''} dans ${r.chemin}.` })
    else if (r.erreur === 'annule') setMessage(null)
    else setMessage({ erreur: true, texte: r.message || (r.erreur === 'en-cours' ? 'Un import ou un export est déjà en cours.' : 'Impossible d’écrire le fichier.') })
  }
  const exporter = async (f: () => Promise<ResultatExport>, quoi: string): Promise<boolean> => {
    setOccupe(true)
    setMessage(null)
    try {
      const r = await f()
      bilan(r, quoi)
      return r.ok
    } catch (e) {
      setMessage({ erreur: true, texte: messageErreur(e) })
      return false
    } finally {
      setOccupe(false)
    }
  }
  const activerAuto = async (): Promise<void> => {
    setOccupe(true)
    setMessage(null)
    try {
      const r = await window.lyra.invoke('export:sauvegardeAuto', { activer: true, phrase: phraseAuto })
      if (r.ok) {
        setEtat(r.etat)
        setAuto(false)
        setPhraseAuto('')
        setConfirmationAuto('')
        setMessage({ erreur: false, texte: 'Sauvegarde automatique activée.' })
      } else if (r.erreur !== 'annule') setMessage({ erreur: true, texte: r.message })
    } catch (e) {
      setMessage({ erreur: true, texte: messageErreur(e) })
    } finally {
      setOccupe(false)
    }
  }
  const desactiverAuto = async (): Promise<void> => {
    try {
      const r = await window.lyra.invoke('export:sauvegardeAuto', { activer: false })
      if (r.ok) setEtat(r.etat)
    } catch (e) {
      setMessage({ erreur: true, texte: messageErreur(e) })
    }
  }
  const aideAuto = etat?.actif
    ? `Active : ${etat.dossier ?? ''}${etat.derniere ? ` · dernière sauvegarde le ${jourHeure(etat.derniere)}` : ''}${etat.erreur ? ` · ${etat.erreur}` : ''}`
    : 'Chaque nuit, dans un dossier de votre choix (iCloud Drive, OneDrive, disque externe…)'

  return (
    <>
      <h2 class="etape export">Exporter depuis Lyra</h2>
      <div class="card" id="exports">
        {EXPORTS.map((x) => (
          <div class="row" key={x.canal} data-export={x.canal}>
            <div class="lbl">
              <span>{x.titre}</span>
              <span class="hint">{x.aide}</span>
            </div>
            <button class="btn" type="button" disabled={occupe} aria-label={`Exporter ${x.titre}`} onClick={() => void exporter(() => window.lyra.invoke(x.canal, {}), x.titre)}>
              Exporter…
            </button>
          </div>
        ))}
        <div class="row" data-export="paquet">
          <div class="lbl">
            <span>Paquet Lyra complet (.lyra)</span>
            <span class="hint">Tout ce qui précède plus extensions et données de sites, chiffré par une phrase de passe — pour changer de machine</span>
          </div>
          <button class="btn pri" type="button" id="creer-paquet" disabled={occupe} onClick={() => setPaquet(!paquet)}>
            Créer le paquet…
          </button>
        </div>
        {paquet && (
          <div class="champ-phrase">
            <label for="phrase-paquet" class="hint">
              Phrase de passe (8 caractères au moins)
            </label>
            <input id="phrase-paquet" class="inp" type="password" autocomplete="off" value={phrase} onInput={(ev) => setPhrase((ev.currentTarget as HTMLInputElement).value)} />
            <label for="phrase-paquet-confirmation" class="hint">
              Confirmer la phrase de passe
            </label>
            <input id="phrase-paquet-confirmation" class="inp" type="password" autocomplete="off" value={confirmation} onInput={(ev) => setConfirmation((ev.currentTarget as HTMLInputElement).value)} />
            {phrase !== confirmation && phrase !== '' && (
              <span class="hint alerte" id="phrases-differentes-paquet" role="alert">
                Les deux phrases ne correspondent pas.
              </span>
            )}
            <button
              class="btn pri"
              type="button"
              id="valider-paquet"
              disabled={occupe || phrase !== confirmation}
              onClick={() =>
                void exporter(() => window.lyra.invoke('export:paquet', { phrase }), 'Paquet Lyra').then((ok) => {
                  if (ok) {
                    setPhrase('')
                    setConfirmation('')
                    setPaquet(false)
                  }
                })
              }
            >
              Créer
            </button>
          </div>
        )}
        <div class="row" data-export="auto">
          <div class="lbl">
            <span>Sauvegarde automatique du paquet</span>
            <span class="hint" id="aide-sauvegarde-auto">
              {aideAuto}
            </span>
          </div>
          {etat?.actif && (
            <button class="btn" type="button" id="desactiver-auto" disabled={occupe} onClick={() => void desactiverAuto()}>
              Désactiver
            </button>
          )}
          <button class="btn" type="button" id="choisir-dossier" disabled={occupe} onClick={() => setAuto(!auto)}>
            Choisir un dossier…
          </button>
        </div>
        {auto && (
          <div class="champ-phrase">
            <label for="phrase-auto" class="hint">
              Phrase de passe du paquet (8 caractères au moins)
            </label>
            <input id="phrase-auto" class="inp" type="password" autocomplete="off" value={phraseAuto} onInput={(ev) => setPhraseAuto((ev.currentTarget as HTMLInputElement).value)} />
            <label for="phrase-auto-confirmation" class="hint">
              Confirmer la phrase de passe
            </label>
            <input id="phrase-auto-confirmation" class="inp" type="password" autocomplete="off" value={confirmationAuto} onInput={(ev) => setConfirmationAuto((ev.currentTarget as HTMLInputElement).value)} />
            {phraseAuto !== confirmationAuto && phraseAuto !== '' && (
              <span class="hint alerte" id="phrases-differentes-auto" role="alert">
                Les deux phrases ne correspondent pas.
              </span>
            )}
            <button class="btn pri" type="button" id="valider-auto" disabled={occupe || phraseAuto !== confirmationAuto} onClick={() => void activerAuto()}>
              Activer
            </button>
          </div>
        )}
      </div>
      {message && (
        <p class={message.erreur ? 'alerte' : 'info'} role={message.erreur ? 'alert' : 'status'} id="message-export">
          {message.texte}
        </p>
      )}
    </>
  )
}
