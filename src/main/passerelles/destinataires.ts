/** `passerelles:changed` n'intéresse que les pages `lyra://` (Réglages › Réseau) : ni les pages web, ni l'interface, ni les fenêtres privées. */
export const recoitPasserelles = (url: string, privee: boolean): boolean => url.startsWith('lyra://') && !privee
