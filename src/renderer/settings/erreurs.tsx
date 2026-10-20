import { useState } from 'preact/hooks'

/** Message d'erreur discret d'une action : `rattraper(promesse, message)` l'affiche si la promesse échoue, l'efface sinon. */
export function useErreur(): [string, <T>(p: Promise<T>, message?: string) => Promise<T | undefined>, (m: string) => void] {
  const [erreur, setErreur] = useState('')
  const rattraper = <T,>(p: Promise<T>, message = "L'action a échoué. Réessayez."): Promise<T | undefined> =>
    p.then(
      (v) => {
        setErreur('')
        return v
      },
      () => {
        setErreur(message)
        return undefined
      }
    )
  return [erreur, rattraper, setErreur]
}

export function MessageErreur({ message }: { message: string }) {
  return message ? (
    <span class="hint erreur" role="alert">
      {message}
    </span>
  ) : null
}
