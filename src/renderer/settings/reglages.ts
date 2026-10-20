import { useEffect, useState } from 'preact/hooks'
import type { Settings } from '../../shared/types'

/** Réglages courants (lus au montage, tenus à jour par `settings:changed`) et leur écriture. */
export function useReglages(): [Settings | null, (patch: Record<string, unknown>) => void] {
  const [s, setS] = useState<Settings | null>(null)
  useEffect(() => {
    void window.lyra.invoke('settings:get').then(setS)
    return window.lyra.on('settings:changed', setS)
  }, [])
  return [s, (patch) => void window.lyra.invoke('settings:set', patch as Partial<Settings>)]
}
