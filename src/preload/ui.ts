// Preload de la vue d'interface (ui.html) : expose window.lyra, typé par shared/ipc.
import { contextBridge, ipcRenderer } from 'electron'
import type { LyraApi } from '../shared/ipc'

const api: LyraApi = {
  invoke: (canal, data) => ipcRenderer.invoke(canal, data),
  on: (canal, cb) => {
    const ecouteur = (_e: unknown, data: Parameters<typeof cb>[0]): void => cb(data)
    ipcRenderer.on(canal, ecouteur)
    return () => {
      ipcRenderer.removeListener(canal, ecouteur)
    }
  },
  plateforme: process.platform
}

contextBridge.exposeInMainWorld('lyra', api)
