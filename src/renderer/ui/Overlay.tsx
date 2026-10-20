import { useEffect, useState } from 'preact/hooks'
import type { AncreMenu, RouteOverlay } from '../../shared/ipc'
import { Palette } from './Palette'
import { ShieldsPanel } from './ShieldsPanel'
import { DownloadsPanel } from './Downloads'
import { MenuPanel } from './MenuPanel'
import { ExtensionsPanel } from './ExtensionsPanel'
import { PermissionPrompt } from './PermissionPrompt'

/**
 * Routeur de la vue overlay. La palette reste montée (masquée) : elle écoute palette:open,
 * qui suit immédiatement overlay:route, et ne doit pas manquer l'évènement en se remontant ;
 * il en va de même pour la demande de permission (permission:ask) et l'ancre du menu (menu:ancre).
 */
export function Overlay() {
  const [route, setRoute] = useState<RouteOverlay>('palette')
  const [ouverture, setOuverture] = useState(0)
  const [ancre, setAncre] = useState<AncreMenu | null>(null)
  useEffect(
    () =>
      window.lyra.on('overlay:route', (r) => {
        setRoute(r)
        setOuverture((n) => n + 1)
      }),
    []
  )
  useEffect(() => window.lyra.on('menu:ancre', setAncre), [])
  return (
    <>
      <div hidden={route !== 'palette'}>
        <Palette />
      </div>
      {route === 'shields' && <ShieldsPanel key={ouverture} />}
      {route === 'downloads' && <DownloadsPanel key={ouverture} />}
      {route === 'extensions' && <ExtensionsPanel key={ouverture} />}
      {route === 'menu' && <MenuPanel key={ouverture} ancre={ancre} />}
      <PermissionPrompt visible={route === 'permission'} />
    </>
  )
}
