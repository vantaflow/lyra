import { useState } from 'preact/hooks'
import { messageErreur } from '../ui/messageErreur'

/** Boutons d'en-tête : exporter / importer les réglages (JSON), avec un retour lisible. */
export function ActionsReglages() {
  const [retour, setRetour] = useState('')
  const agir = async (canal: 'settings:export' | 'settings:import'): Promise<void> => {
    setRetour('')
    try {
      const r = await window.lyra.invoke(canal)
      if (r && typeof r === 'object' && 'erreur' in r) setRetour(r.erreur)
      else if (canal === 'settings:import' && r) setRetour('Réglages importés.')
      else if (canal === 'settings:export' && r === true) setRetour('Réglages exportés.')
    } catch (e) {
      setRetour(messageErreur(e, canal === 'settings:import' ? 'Import impossible. Réessayez.' : 'Export impossible. Réessayez.'))
    }
  }
  return (
    <>
      {retour && (
        <span class="hint" role="status" id="retour-reglages">
          {retour}
        </span>
      )}
      <button class="btn" type="button" onClick={() => void agir('settings:export')}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 4v11" />
          <path d="M7 11l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
        Exporter les réglages
      </button>
      <button class="btn" type="button" onClick={() => void agir('settings:import')}>
        Importer
      </button>
    </>
  )
}
