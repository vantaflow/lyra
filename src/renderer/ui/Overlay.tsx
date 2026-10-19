import { useEffect, useState } from 'preact/hooks'
import type { RouteOverlay } from '../../shared/ipc'
import { Palette } from './Palette'
import { ShieldsPanel } from './ShieldsPanel'
import { DownloadsPanel } from './Downloads'

/**
 * Routeur de la vue overlay. La palette reste montée (masquée) : elle écoute palette:open,
 * qui suit immédiatement overlay:route, et ne doit pas manquer l'évènement en se remontant.
 */
export function Overlay() {
  const [route, setRoute] = useState<RouteOverlay>('palette')
  const [ouverture, setOuverture] = useState(0)
  useEffect(
    () =>
      window.lyra.on('overlay:route', (r) => {
        setRoute(r)
        setOuverture((n) => n + 1)
      }),
    []
  )
  return (
    <>
      <div hidden={route !== 'palette'}>
        <Palette />
      </div>
      {route === 'shields' && <ShieldsPanel key={ouverture} />}
      {route === 'downloads' && <DownloadsPanel key={ouverture} />}
    </>
  )
}
