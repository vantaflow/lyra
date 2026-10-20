import { HEURE_VALIDE } from '../../shared/heure-sombre'
import { Ligne } from './controles'

/**
 * Plage « Sombre de [21:00] à [07:00] » : deux `<input type="time">` natifs. La Tâche 9 la place sous le segment
 * « Passer en sombre », seulement quand « À une heure fixe » est choisi (`passage === 'heure'`) :
 * `{couleurs.passage === 'heure' && <PlageSombre debut={couleurs.heureSombre} fin={couleurs.heureClair} surChange={(p) => set({ couleurs: p })} />}`
 */
export function PlageSombre(p: { debut: string; fin: string; surChange: (patch: { heureSombre?: string; heureClair?: string }) => void }) {
  // Un champ vidé (valeur '') est ignoré : le réglage garde sa dernière heure valide.
  const poser = (cle: 'heureSombre' | 'heureClair') => (e: Event) => {
    const v = (e.currentTarget as HTMLInputElement).value
    if (HEURE_VALIDE.test(v)) p.surChange({ [cle]: v })
  }
  return (
    <Ligne titre="Sombre de" aide="Une plage à cheval sur minuit est normale ; de et à identiques : toujours sombre." reglage="couleurs.heure">
      <div class="plage-sombre">
        <input class="champ-heure" type="time" step={60} aria-label="Début du mode sombre" value={p.debut} onChange={poser('heureSombre')} />
        <span>à</span>
        <input class="champ-heure" type="time" step={60} aria-label="Fin du mode sombre" value={p.fin} onChange={poser('heureClair')} />
      </div>
    </Ligne>
  )
}
