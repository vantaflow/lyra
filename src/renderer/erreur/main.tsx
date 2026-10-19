import { render } from 'preact'
import '../ui/theme.css'
import './erreur.css'

type Type = 'reseau' | 'introuvable' | 'certificat' | 'passerelles'

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
  certificat: {
    titre: "Ce site n'est pas sûr",
    texte: "Le certificat de sécurité de ce site n'est pas valide : vos échanges avec lui pourraient être lus ou modifiés. Le plus prudent est de ne pas continuer."
  }
}

const params = new URLSearchParams(location.search)
const brut = params.get('type')
const type: Type = brut === 'certificat' || brut === 'introuvable' || brut === 'passerelles' ? brut : 'reseau'
/** Site contourné : jamais « Continuer quand même » (le processus principal refuse aussi). */
const contourne = params.get('contourne') === '1'
const url = params.get('url') ?? ''
const { titre, texte } = TEXTES[type]
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
  return (
    <main class="erreur">
      <section class="erreur-carte">
        <Icone danger={type === 'certificat'} />
        <h1>{titre}</h1>
        {url && <div class="erreur-url">{url}</div>}
        <p class="erreur-texte">{texte}</p>
        <div class="erreur-actions">
          <button class="btn pri" type="button" onClick={() => void window.lyra.invoke('erreur:reessayer', { url })}>
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
