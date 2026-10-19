/** Menu contextuel maison d'une vue (clic droit) : navigation, liens, images, sélection, orthographe. */
import { clipboard, Menu, type BaseWindow, type MenuItemConstructorOptions, type WebContents } from 'electron'

export interface DepsMenuContextuel {
  fenetre: BaseWindow
  /** Ouvre l'adresse dans une nouvelle étoile reliée à celle-ci. */
  ouvrirDansEtoile(url: string): void
  /** Adresse de recherche (moteur par défaut) pour ce texte. */
  rechercheUrl(texte: string): string
}

const COURT = 30

export const abreger = (t: string): string => {
  const un = t.replace(/\s+/g, ' ').trim()
  return un.length > COURT ? `${un.slice(0, COURT - 1)}…` : un
}

export function modeleMenu(wc: WebContents, p: Electron.ContextMenuParams, deps: DepsMenuContextuel): MenuItemConstructorOptions[] {
  const sep: MenuItemConstructorOptions = { type: 'separator' }
  const m: MenuItemConstructorOptions[] = []
  const section = (items: MenuItemConstructorOptions[]): void => {
    if (items.length === 0) return
    if (m.length > 0) m.push(sep)
    m.push(...items)
  }

  if (p.misspelledWord) {
    const suggestions = p.dictionarySuggestions.map<MenuItemConstructorOptions>((s) => ({ label: s, click: () => wc.replaceMisspelling(s) }))
    section([
      ...(suggestions.length > 0 ? suggestions : [{ label: 'Aucune suggestion', enabled: false }]),
      { label: 'Ajouter au dictionnaire', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) }
    ])
  }

  if (p.linkURL) {
    section([
      { label: 'Ouvrir le lien dans une nouvelle étoile', click: () => deps.ouvrirDansEtoile(p.linkURL) },
      { label: 'Copier le lien', click: () => clipboard.writeText(p.linkURL) }
    ])
  }

  if (p.mediaType === 'image' && p.srcURL) {
    section([
      { label: "Copier l'adresse de l'image", click: () => clipboard.writeText(p.srcURL) },
      { label: "Enregistrer l'image sous…", click: () => wc.downloadURL(p.srcURL) }
    ])
  }

  const texte = p.selectionText.trim()
  if (p.isEditable || texte) {
    const e = p.editFlags
    section([
      ...(p.isEditable ? [{ label: 'Couper', enabled: e.canCut, click: () => wc.cut() }] : []),
      { label: 'Copier', enabled: e.canCopy, click: () => wc.copy() },
      ...(p.isEditable ? [{ label: 'Coller', enabled: e.canPaste, click: () => wc.paste() }] : []),
      { label: 'Tout sélectionner', enabled: e.canSelectAll, click: () => wc.selectAll() }
    ])
  }
  if (texte) {
    section([{ label: `Rechercher « ${abreger(texte)} »`, click: () => deps.ouvrirDansEtoile(deps.rechercheUrl(texte)) }])
  }

  if (!p.isEditable && !texte && !p.linkURL && p.mediaType !== 'image') {
    section([
      { label: 'Précédent', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: 'Suivant', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
      { label: 'Recharger', click: () => wc.reload() }
    ])
  }

  section([{ label: 'Inspecter', click: () => wc.inspectElement(p.x, p.y) }])
  return m
}

export function installerMenuContextuel(wc: WebContents, deps: DepsMenuContextuel): void {
  wc.on('context-menu', (_e, params) => {
    Menu.buildFromTemplate(modeleMenu(wc, params, deps)).popup({ window: deps.fenetre })
  })
}
