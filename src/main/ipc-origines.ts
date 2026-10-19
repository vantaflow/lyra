/** Logique pure (sans Electron) de contrôle de l'expéditeur IPC. */
export interface OriginesUI {
  /** Serveur de dev (ELECTRON_RENDERER_URL), s'il existe. */
  dev?: string
  /** URL de préfixe du renderer packagé (file://…/out/renderer/). */
  prod: string
}

export function expediteurAutorise(url: string, origines: OriginesUI): boolean {
  if (url.startsWith('lyra://')) return true
  if (origines.dev) return url === origines.dev || url.startsWith(`${origines.dev}/`)
  return url.startsWith(origines.prod)
}
