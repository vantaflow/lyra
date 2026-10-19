import { render } from 'preact'
import { useState } from 'preact/hooks'
import { messageErreur } from '../ui/messageErreur'
import '../ui/theme.css'
import './erreur.css'

type Type = 'reseau' | 'introuvable' | 'certificat' | 'passerelles' | 'http'

const TEXTES: Record<Type, { titre: string; texte: string }> = {
  introuvable: {
    titre: 'Cette page est introuvable',
    texte: "L'adresse n'existe pas ou n'existe plus. Vérifiez qu'elle est bien écrite."
  },
  reseau: {
    titre: 'Connexion impossible',
    texte: "Lyra n'a pas pu joindre ce site. Vérifiez votre connexion, puis réessayez."
  },
  passerelles: {
    titre: 'Aucune passerelle ne répond',
    texte: "Ce site passe par une passerelle, mais aucune n'a répondu. Réessayez dans un instant : Lyra en cherche d'autres."
  },
  http: {
    titre: "Ce site n'est pas chiffré",
    texte: "Ce site n'est pas chiffré : les passerelles publiques ne transportent que les sites https."
  },
  certificat: {
    titre: "Ce site n'est pas sûr",
    texte: "Le certificat de sécurité de ce site n'est pas valide : vos échanges avec lui pourraient être lus ou modifiés. Le plus prudent est de ne pas continuer."
  }
}

const params = new URLSearchParams(location.search)
const brut = params.get('type')
const type: Type = brut === 'certificat' || brut === 'introuvable' || brut === 'passerelles' || brut === 'http' ? brut : 'reseau'
/** Site contourné : jamais « Continuer quand même » (le processus principal refuse aussi). */
const contourne = params.get('contourne') === '1'
/** Site https non contourné : « Passer par une passerelle » (le processus principal revérifie). */
const passerelle = params.get('passerelle') === '1'
const url = params.get('url') ?? ''
const base = TEXTES[type]
/** Libellé du design (Passerelles.dc.html) quand « Passer par une passerelle » est proposé. */
const hoteBloque = ((): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
})()
/** Blocage probable (réseau ou nom introuvable) : titre et texte du design, avec « Passer par une passerelle ». */
const bloque = passerelle && (type === 'reseau' || type === 'introuvable') && hoteBloque !== ''
const titre = bloque ? TEXTES.reseau.titre : base.titre
const texte = bloque ? `${hoteBloque} ne répond pas sur ce réseau. Il est peut-être bloqué.` : base.texte
document.title = titre

const Icone = ({ danger }: { danger: boolean }) => (
  <span class={`erreur-icone${danger ? ' danger' : ''}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      {type === 'certificat' ? (
        <>
          <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6z" />
          <path d="M12 8.5v4" />
          <path d="M12 15.5h.01" />
        </>
      ) : type === 'introuvable' ? (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
          <path d="M9 9l4 4M13 9l-4 4" />
        </>
      ) : (
        <>
          <path d="M3 9a14 14 0 0 1 18 0" />
          <path d="M6.5 12.5a9 9 0 0 1 11 0" />
          <path d="M10 16a4 4 0 0 1 4 0" />
          <path d="M4 4l16 16" />
        </>
      )}
    </svg>
  </span>
)

function Erreur() {
  const [refus, setRefus] = useState('')
  const passer = (): void =>
    void window.lyra.invoke('erreur:passerelle', { url }).then(
      (r) => setRefus(r?.erreur ?? ''),
      (e) => setRefus(messageErreur(e))
    )
  return (
    <main class="erreur">
      <section class="erreur-carte">
        <Icone danger={type === 'certificat'} />
        <h1>{titre}</h1>
        {url && <div class="erreur-url">{url}</div>}
        <p class="erreur-texte">{texte}</p>
        {refus && (
          <p class="erreur-refus" role="alert">
            {refus}
          </p>
        )}
        <div class="erreur-actions">
          {passerelle && (
            <button class="btn pri" type="button" onClick={passer}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 8h13l-3-3" />
                <path d="M20 16H7l3 3" />
              </svg>
              Passer par une passerelle
            </button>
          )}
          <button class={passerelle ? 'btn' : 'btn pri'} type="button" onClick={() => void window.lyra.invoke('erreur:reessayer', { url })}>
            Réessayer
          </button>
          {type === 'certificat' && !contourne && (
            <button class="btn" type="button" onClick={() => void window.lyra.invoke('erreur:continuer', { url })}>
              Continuer quand même
            </button>
          )}
        </div>
      </section>
    </main>
  )
}

render(<Erreur />, document.getElementById('app')!)
