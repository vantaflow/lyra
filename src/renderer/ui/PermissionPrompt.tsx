import { useEffect, useState } from 'preact/hooks'
import type { DemandePermission } from '../../shared/ipc'
import type { Settings, TypePermission } from '../../shared/types'
import { marges } from './placements'

const PHRASES: Record<TypePermission, string> = {
  camera: 'utiliser votre caméra',
  micro: 'utiliser votre micro',
  notifications: 'afficher des notifications',
  geolocalisation: 'connaître votre position',
  'presse-papiers': 'lire le presse-papiers'
}

/** « utiliser votre caméra et votre micro », « afficher des notifications »… */
export function phraseDemande(types: TypePermission[]): string {
  if (types.includes('camera') && types.includes('micro')) {
    return ['utiliser votre caméra et votre micro', ...types.filter((t) => t !== 'camera' && t !== 'micro').map((t) => PHRASES[t])].join(' et ')
  }
  return types.map((t) => PHRASES[t]).join(' et ')
}

export function nomDuSite(origine: string): string {
  if (origine === 'file://') return 'Ce fichier local'
  try {
    return new URL(origine).host
  } catch {
    return origine
  }
}

/**
 * Demande de permission : petite carte sous la pilule (Refuser / Autoriser, « Se souvenir pour ce site »).
 * Toujours montée : permission:ask suit immédiatement overlay:route et ne doit pas être manquée.
 */
export function PermissionPrompt({ visible }: { visible: boolean }) {
  const [demande, setDemande] = useState<DemandePermission | null>(null)
  const [souvenir, setSouvenir] = useState(false)
  const [ciel, setCiel] = useState<Settings['ciel'] | undefined>()

  // Fenêtre privée : rien n'est mémorisé, la case n'est pas proposée (par défaut masquée tant que le main n'a pas répondu).
  const [privee, setPrivee] = useState(true)
  useEffect(() => {
    void window.lyra.invoke('fenetre:privee').then(setPrivee, () => setPrivee(true))
  }, [])
  useEffect(() => {
    void window.lyra.invoke('settings:get').then((r) => setCiel(r.ciel))
    const off = window.lyra.on('settings:changed', (r) => setCiel(r.ciel))
    const offAsk = window.lyra.on('permission:ask', (d) => {
      setDemande(d)
      setSouvenir(false)
    })
    return () => {
      off()
      offAsk()
    }
  }, [])

  const repondre = (decision: 'autoriser' | 'refuser', memoriser: boolean): void => {
    if (!demande) return
    const id = demande.id
    setDemande(null)
    void window.lyra.invoke('permission:answer', { id, decision, memoriser })
  }
  // Échap ou clic à côté : refus sans mémoire.
  useEffect(() => {
    if (!visible || !demande) return
    const touche = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') repondre('refuser', false)
    }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [visible, demande])

  if (!visible || !demande) return null
  const m = marges(ciel)
  return (
    <div class="pn-fond" onMouseDown={(e) => e.target === e.currentTarget && repondre('refuser', false)}>
      <div class="perm-zone" style={m}>
        <section class="perm-carte" role="alertdialog" aria-label="Demande d’autorisation" aria-describedby="perm-texte">
          <div id="perm-texte" class="perm-texte">
            <strong>{nomDuSite(demande.origine)}</strong> souhaite {phraseDemande(demande.types)}
          </div>
          {!privee && (
            <label class="perm-souvenir">
              <input type="checkbox" checked={souvenir} onChange={(e) => setSouvenir(e.currentTarget.checked)} />
              Se souvenir pour ce site
            </label>
          )}
          <div class="perm-actions">
            <button class="btn" type="button" onClick={() => repondre('refuser', souvenir)}>
              Refuser
            </button>
            <button class="btn pri" type="button" onClick={() => repondre('autoriser', souvenir)}>
              Autoriser
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
