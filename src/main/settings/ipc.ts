/** IPC des réglages qui dépendent d'Electron : dialogues de dossier, export et import (le thème : `theme/installer.ts`). */
import { dialog } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { handle } from '../ipc'
import type { Reglages } from './settings'
import { contenuExport, importerTheme } from './themes-fichier'
import { TAILLE_MAX_THEME } from '../../shared/themes'
import { TAILLE_MAX_IMPORT, ErreurReglagesVolumineux, patchImporte, serialiserReglages } from './import'

export function installerReglagesIpc(reglages: Reglages): void {
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
  handle('themes:importer', async () => {
    const r = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] })
    if (r.canceled || r.filePaths.length === 0) return null
    try {
      const brut = await readFile(r.filePaths[0], 'utf8')
      if (Buffer.byteLength(brut, 'utf8') >= TAILLE_MAX_THEME) return { erreur: 'Fichier trop gros (20 Ko maximum).' }
      return importerTheme(brut, reglages)
    } catch {
      return { erreur: 'Fichier illisible.' }
    }
  })

  handle('themes:exporter', async () => {
    const r = await dialog.showSaveDialog({ defaultPath: 'mes-couleurs.json', filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (r.canceled || !r.filePath) return false
    try {
      await writeFile(r.filePath, contenuExport(reglages.getSettings().couleurs.personnalisees), 'utf8')
    } catch {
      return { erreur: "Le fichier n'a pas pu être écrit." }
    }
    return true
  })
}
