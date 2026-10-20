/** IPC des réglages qui dépendent d'Electron : thème, dialogues de dossier, export et import. */
import { dialog, nativeTheme } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import type { Settings } from '../../shared/types'
import { handle } from '../ipc'
import type { Reglages } from './settings'
import { TAILLE_MAX_IMPORT, ErreurReglagesVolumineux, patchImporte, serialiserReglages } from './import'

const THEMES: Record<Settings['theme'], 'system' | 'light' | 'dark'> = { systeme: 'system', clair: 'light', sombre: 'dark', programme: 'system' }

/** Le thème des réglages devient celui d'Electron (prefers-color-scheme des pages comprise). */
export function appliquerTheme(theme: Settings['theme']): void {
  nativeTheme.themeSource = THEMES[theme]
}

export function installerReglagesIpc(reglages: Reglages): void {
  appliquerTheme(reglages.getSettings().theme)
  reglages.onChanged((s) => appliquerTheme(s.theme))

  handle('settings:choisirDossier', async () => {
    const r = await dialog.showOpenDialog({
      defaultPath: reglages.getSettings().telechargements.dossier,
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  })

  handle('settings:export', async () => {
    const r = await dialog.showSaveDialog({
      defaultPath: 'reglages-lyra.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePath) return false
    try {
      await writeFile(r.filePath, serialiserReglages(reglages.getSettings()), 'utf8')
    } catch (e) {
      if (!(e instanceof ErreurReglagesVolumineux)) throw e
      dialog.showErrorBox('Lyra', e.message)
      return false
    }
    return true
  })

  handle('settings:import', async () => {
    const r = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] })
    if (r.canceled || r.filePaths.length === 0) return null
    try {
      const brut = await readFile(r.filePaths[0], 'utf8')
      if (Buffer.byteLength(brut, 'utf8') > TAILLE_MAX_IMPORT) return null
      return reglages.setSettings(patchImporte(JSON.parse(brut)))
    } catch {
      return null
    }
  })
}
