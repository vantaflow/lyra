import { useState } from 'preact/hooks'
import { MOTEURS } from '../../main/palette/engines'

/** Premier lancement : choix du moteur de recherche, à la place du champ (DuckDuckGo présélectionné). */
export function PremierLancement({ surChoix }: { surChoix: () => void }) {
  const [choix, setChoix] = useState('duckduckgo')
  const valider = async (): Promise<void> => {
    await window.lyra.invoke('settings:set', { moteurParDefaut: choix, moteurChoisi: true })
    surChoix()
  }
  return (
    <section class="premier" aria-label="Choix du moteur de recherche">
      <h2>Quel moteur de recherche ?</h2>
      <p>Vous pourrez le changer à tout moment dans les réglages.</p>
      <div role="radiogroup" aria-label="Moteurs de recherche" class="moteurs">
        {MOTEURS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={m.id === choix}
            aria-label={m.nom}
            class={m.id === choix ? 'moteur on' : 'moteur'}
            onClick={() => setChoix(m.id)}
          >
            <i style={{ background: m.couleur }}>{m.lettre}</i>
            {m.nom}
          </button>
        ))}
      </div>
      <button type="button" class="go" onClick={() => void valider()}>
        C'est parti
      </button>
    </section>
  )
}
