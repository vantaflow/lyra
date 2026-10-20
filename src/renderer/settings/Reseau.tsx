import { useEffect, useState } from 'preact/hooks'
import type { EtatPasserelles } from '../../shared/ipc'
import type { PasserellePerso, Settings } from '../../shared/types'
import { Interrupteur, Ligne, Segments, Titre } from './controles'
import { messageErreur } from '../ui/messageErreur'
import './reseau.css'

/** Réglages « Réseau et identité » (fidèle à docs/design/project/Passerelles.dc.html). */

const Relais = ({ taille = 14 }: { taille?: number }) => (
  <svg viewBox="0 0 24 24" width={taille} height={taille} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 8h13l-3-3" />
    <path d="M20 16H7l3 3" />
  </svg>
)

const deux = (n: number): string => String(n).padStart(2, '0')
const jour = (d: Date): string => `${deux(d.getDate())}/${deux(d.getMonth() + 1)}`
const heure = (d: Date): string => `${deux(d.getHours())}:${deux(d.getMinutes())}`

interface Etiquette {
  texte: string
  classe: string
}
function etiquetteEtat(e: EtatPasserelles): Etiquette {
  if (e.enCours) return { texte: 'Recherche…', classe: 'neutre' }
  if (e.pret > 0) return { texte: e.pret > 1 ? 'Prêtes' : 'Prête', classe: 'ok' }
  if (e.erreur === 'injoignable') return { texte: 'Injoignable', classe: 'ko' }
  if (e.erreur === 'aucune') return { texte: 'Aucune ne répond', classe: 'ko' }
  if (e.erreur === 'liste') return { texte: 'Liste indisponible', classe: 'ko' }
  return { texte: 'En veille', classe: 'neutre' }
}

function resumeEtat(e: EtatPasserelles): string {
  const n = e.pret
  const base = n > 0 ? `${n} passerelle${n > 1 ? 's' : ''} prête${n > 1 ? 's' : ''}` : e.personnelle ? 'Passerelle personnelle' : 'Aucune passerelle prête'
  if (!e.dateListe || e.personnelle) return base
  const d = new Date(e.dateListe)
  return Number.isNaN(d.getTime()) ? base : `${base} · liste du ${jour(d)} à ${heure(d)}`
}

/** Le design n'affiche « et ses sous-domaines » que pour un domaine (exemple.com), pas pour un sous-domaine. */
const estDomaine = (hote: string): boolean => hote.split('.').length <= 2

export function Reseau() {
  const [e, setE] = useState<EtatPasserelles | null>(null)
  const [saisie, setSaisie] = useState('')
  const [refus, setRefus] = useState('')
  const [type, setType] = useState<PasserellePerso['type']>('socks5')
  const [hote, setHote] = useState('')
  const [port, setPort] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [persoMsg, setPersoMsg] = useState('')
  const [majAuto, setMajAuto] = useState<boolean | null>(null)

  useEffect(() => {
    void window.lyra.invoke('settings:get').then((v) => setMajAuto(v.extensions.majAuto))
    return window.lyra.on('settings:changed', (v) => setMajAuto(v.extensions.majAuto))
  }, [])
  useEffect(() => {
    void window.lyra.invoke('passerelles:etat').then((v) => {
      setE(v)
      if (v.personnelle) {
        setType(v.personnelle.type)
        setHote(v.personnelle.hote)
        setPort(String(v.personnelle.port))
      }
    })
    return window.lyra.on('passerelles:changed', setE)
  }, [])
  if (!e) return null

  const regler = (reseau: Partial<Settings['reseau']>): void => void window.lyra.invoke('settings:set', { reseau } as Partial<Settings>)
  const action = async (f: () => Promise<EtatPasserelles>): Promise<EtatPasserelles | undefined> => {
    setOccupe(true)
    try {
      const v = await f()
      setE(v)
      return v
    } catch (err) {
      setPersoMsg(messageErreur(err))
      return undefined
    } finally {
      setOccupe(false)
    }
  }
  const ajouter = async (ev?: Event): Promise<void> => {
    ev?.preventDefault()
    if (!saisie.trim()) return
    try {
      setE(await window.lyra.invoke('passerelles:ajouter', { hote: saisie }))
      setSaisie('')
      setRefus('')
    } catch (err) {
      setRefus(messageErreur(err))
    }
  }
  const retirer = (h: string): void => void window.lyra.invoke('passerelles:retirer', { hote: h }).then(setE)
  const bilan = (v: EtatPasserelles | undefined): void => {
    if (!v) return
    setPersoMsg(v.erreur === 'injoignable' ? 'Cette passerelle ne répond pas.' : v.personnelle ? 'Passerelle prête.' : '')
  }
  const tester = async (): Promise<void> => {
    setPersoMsg('')
    const n = Number(port)
    if (!hote.trim() || !Number.isInteger(n) || n < 1 || n > 65535) {
      setPersoMsg('Renseignez un hôte et un port valides (1 à 65535).')
      return
    }
    bilan(await action(() => window.lyra.invoke('passerelles:personnelle', { config: { type, hote: hote.trim(), port: n } })))
  }
  const effacer = async (): Promise<void> => {
    setPersoMsg('')
    const v = await action(() => window.lyra.invoke('passerelles:personnelle', { config: null }))
    if (v) {
      setHote('')
      setPort('')
    }
  }
  const warp = async (): Promise<void> => {
    setPersoMsg('')
    const v = await action(() => window.lyra.invoke('passerelles:warp'))
    if (v?.personnelle) {
      setType(v.personnelle.type)
      setHote(v.personnelle.hote)
      setPort(String(v.personnelle.port))
    }
    bilan(v)
  }
  const etiquette = etiquetteEtat(e)

  return (
    <>
      <p class="sous-titre">Atteindre les sites bloqués par le réseau sur lequel vous êtes.</p>
      <div class="card">
        <Ligne reglage="reseau.passerelles" titre="Passerelles pour les sites bloqués" aide="Les sites de la liste passent toujours par une passerelle ; les autres restent en direct">
          <Interrupteur actif={e.actif} libelle="Passerelles" surChange={(passerelles) => regler({ passerelles })} />
        </Ligne>
        <Ligne
          reglage="reseau.detection"
          titre="Détecter les sites bloqués automatiquement"
          aide="Si un site https ne répond pas alors que le réseau fonctionne, Lyra essaie une passerelle et l'ajoute si elle réussit"
        >
          <Interrupteur actif={e.auto} libelle="Détection automatique" surChange={(auto) => regler({ auto })} />
        </Ligne>
        <Ligne reglage="reseau.etat" titre="État" aide={resumeEtat(e)}>
          <span class={`tag ${etiquette.classe}`} role="status">
            {etiquette.texte}
          </span>
          <button class="btn" type="button" id="tester-maintenant" disabled={occupe || e.enCours} onClick={() => void action(() => window.lyra.invoke('passerelles:tester'))}>
            Tester maintenant
          </button>
        </Ligne>
      </div>

      <Titre>{`Sites contournés — ${e.sites.length}`}</Titre>
      <div class="card" id="sites-contournes">
        {e.sites.map((s) => {
          const d = new Date(s.date)
          return (
            <div class="row site" key={s.hote} data-hote={s.hote}>
              <span class="relais" aria-hidden="true">
                <Relais />
              </span>
              <div class="lbl">
                <strong>{s.hote}</strong>
                <span class="hint">
                  {estDomaine(s.hote) ? 'et ses sous-domaines · ' : ''}ajouté le {Number.isNaN(d.getTime()) ? '' : jour(d)}
                </span>
              </div>
              <span class={`tag ${s.origine === 'auto' ? 'detecte' : 'neutre'}`}>{s.origine === 'auto' ? 'Détecté' : 'Ajouté'}</span>
              <button class="btn" type="button" aria-label={`Retirer ${s.hote}`} onClick={() => retirer(s.hote)}>
                Retirer
              </button>
            </div>
          )
        })}
        <form class="row" onSubmit={(ev) => void ajouter(ev)}>
          <label for="ajout-site" class="sr">
            Ajouter un site
          </label>
          <input
            id="ajout-site"
            class="inp"
            type="text"
            placeholder="Ajouter un site (ex. exemple.com)"
            value={saisie}
            aria-invalid={refus ? true : undefined}
            aria-describedby={refus ? 'ajout-refus' : undefined}
            onInput={(ev) => setSaisie((ev.currentTarget as HTMLInputElement).value)}
          />
          <button class="btn pri" type="submit" disabled={!saisie.trim()}>
            Ajouter
          </button>
        </form>
        {refus && (
          <p class="refus" id="ajout-refus" role="alert">
            {refus}
          </p>
        )}
      </div>

      <Titre>Passerelle personnelle</Titre>
      <div class="card">
        <div class="row perso">
          <div class="lbl plein">
            <span>Votre propre passerelle</span>
            <span class="hint">Si elle est renseignée, elle remplace les passerelles publiques</span>
          </div>
          <Segments
            valeur={type}
            options={[
              { id: 'socks5', libelle: 'SOCKS5' },
              { id: 'http', libelle: 'HTTP' }
            ]}
            surChange={setType}
          />
          <label for="hote-p" class="sr">
            Hôte
          </label>
          <input id="hote-p" class="inp" type="text" placeholder="Hôte" value={hote} onInput={(ev) => setHote((ev.currentTarget as HTMLInputElement).value)} />
          <label for="port-p" class="sr">
            Port
          </label>
          <input id="port-p" class="inp port" type="text" inputMode="numeric" placeholder="Port" value={port} onInput={(ev) => setPort((ev.currentTarget as HTMLInputElement).value)} />
          <button class="btn" type="button" id="tester-perso" disabled={occupe || !hote.trim() || !port.trim()} onClick={() => void tester()}>
            Tester
          </button>
          {e.personnelle && (
            <button class="btn" type="button" id="effacer-perso" disabled={occupe} onClick={() => void effacer()}>
              Effacer
            </button>
          )}
        </div>
        <div class="row">
          <div class="lbl">
            <span>Cloudflare WARP</span>
            <span class="hint" role="status">
              {persoMsg || 'Si WARP est installé en mode proxy, Lyra peut l’utiliser comme passerelle'}
            </span>
          </div>
          <button class="btn" type="button" id="warp" disabled={occupe} onClick={() => void warp()}>
            Utiliser Cloudflare WARP (127.0.0.1:40000)
          </button>
        </div>
      </div>

      <Titre>Extensions</Titre>
      <div class="card">
        <Ligne titre="Mettre à jour les extensions automatiquement (toutes les 6 h)" aide="Vérifie le Chrome Web Store, addons.mozilla.org et uBlock Origin ; « Tout mettre à jour » reste disponible dans lyra://extensions">
          <Interrupteur actif={majAuto ?? true} libelle="Mise à jour automatique des extensions" surChange={(majAuto) => void window.lyra.invoke('settings:set', { extensions: { majAuto } } as unknown as Partial<Settings>)} />
        </Ligne>
      </div>

      <div class="avertissement">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.9L2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
        <span>
          Les passerelles publiques sont gérées par des inconnus. Lyra n'y fait passer que des sites chiffrés (https), mais le nom des sites visités leur est visible. Sur un réseau d'entreprise, contourner le
          filtrage peut être contraire au règlement : à vous de juger.
        </span>
      </div>
    </>
  )
}
