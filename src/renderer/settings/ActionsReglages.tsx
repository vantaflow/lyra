/** Boutons d'en-tête : exporter / importer les réglages (JSON). */
export function ActionsReglages() {
  return (
    <>
      <button class="btn" type="button" onClick={() => void window.lyra.invoke('settings:export')}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 4v11" />
          <path d="M7 11l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
        Exporter les réglages
      </button>
      <button class="btn" type="button" onClick={() => void window.lyra.invoke('settings:import')}>
        Importer
      </button>
    </>
  )
}
