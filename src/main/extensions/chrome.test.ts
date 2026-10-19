import { describe, expect, it } from 'vitest'
import { analyserSourceChrome } from './chrome'

const ID = 'eimadpbcbfnmbkopoojfekhnkhdbieeh'

describe('analyserSourceChrome', () => {
  it('reconnaît un identifiant de 32 lettres a-p', () => {
    expect(analyserSourceChrome(ID)).toEqual({ type: 'id', id: ID })
    expect(analyserSourceChrome(`  ${ID}\n`)).toEqual({ type: 'id', id: ID })
  })
  it('refuse un identifiant trop court, trop long ou hors a-p', () => {
    expect(analyserSourceChrome(ID.slice(1))).toBeUndefined()
    expect(analyserSourceChrome(ID + 'a')).toBeUndefined()
    expect(analyserSourceChrome('z'.repeat(32))).toBeUndefined()
  })
  it('extrait l\'identifiant d\'une URL du Chrome Web Store', () => {
    expect(analyserSourceChrome(`https://chromewebstore.google.com/detail/dark-reader/${ID}`)).toEqual({ type: 'url', id: ID })
    expect(analyserSourceChrome(`https://chromewebstore.google.com/detail/dark-reader/${ID}?hl=fr`)).toEqual({ type: 'url', id: ID })
    expect(analyserSourceChrome(`https://chrome.google.com/webstore/detail/dark-reader/${ID}`)).toEqual({ type: 'url', id: ID })
    expect(analyserSourceChrome(`https://chromewebstore.google.com/detail/${ID}`)).toEqual({ type: 'url', id: ID })
  })
  it('refuse les URL d\'un autre hôte ou en http', () => {
    expect(analyserSourceChrome(`https://chromewebstore.google.com.evil.fr/detail/x/${ID}`)).toBeUndefined()
    expect(analyserSourceChrome(`https://evil.fr/chromewebstore.google.com/detail/x/${ID}`)).toBeUndefined()
    expect(analyserSourceChrome(`http://chromewebstore.google.com/detail/x/${ID}`)).toBeUndefined()
    expect(analyserSourceChrome('https://chromewebstore.google.com/category/extensions')).toBeUndefined()
  })
  it('reconnaît .crx, .zip, dossier et uBO', () => {
    expect(analyserSourceChrome('/Users/lilou/Downloads/ext.crx')).toEqual({ type: 'crx' })
    expect(analyserSourceChrome('C:\\Users\\lilou\\ext.ZIP')).toEqual({ type: 'zip' })
    expect(analyserSourceChrome('/Users/lilou/Projects/mon-extension')).toEqual({ type: 'dossier' })
    expect(analyserSourceChrome('ubo')).toEqual({ type: 'ubo' })
    expect(analyserSourceChrome(' UBO ')).toEqual({ type: 'ubo' })
  })
  it('refuse le reste', () => {
    expect(analyserSourceChrome('')).toBeUndefined()
    expect(analyserSourceChrome('dark reader')).toBeUndefined()
    expect(analyserSourceChrome('javascript:alert(1)')).toBeUndefined()
    expect(analyserSourceChrome('a'.repeat(5000))).toBeUndefined()
  })
})
