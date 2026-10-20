/** Test uniquement : fabrique des CRX3 réellement signés (SHA-256 / RSA). */
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { idDepuisCle } from './archives'

const varint = (n: number): number[] => {
  const o: number[] = []
  while (n > 0x7f) { o.push((n & 0x7f) | 0x80); n >>>= 7 }
  o.push(n)
  return o
}
const champ = (num: number, octets: Uint8Array | number[]): number[] => [...varint((num << 3) | 2), ...varint(octets.length), ...octets]

/** CRX3 réellement signé (SHA-256 / RSA) ; `declarer` permet de déclarer l'id d'une autre clé. */
export function crx3Signe(zip: Uint8Array, o: { cle?: { publicKey: KeyObject; privateKey: KeyObject }; declarer?: Buffer } = {}): { octets: Uint8Array; id: string } {
  const paire = o.cle ?? generateKeyPairSync('rsa', { modulusLength: 2048 })
  const der = paire.publicKey.export({ type: 'spki', format: 'der' })
  const crxId = o.declarer ?? createHash('sha256').update(der).digest().subarray(0, 16)
  const signe = Uint8Array.from(champ(1, crxId))
  const taille = Buffer.alloc(4)
  taille.writeUInt32LE(signe.length)
  const message = Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), taille, signe, zip])
  const signature = sign('sha256', message, paire.privateKey)
  const entete = Uint8Array.from([...champ(2, [...champ(1, der), ...champ(2, signature)]), ...champ(10000, signe)])
  const sortie = new Uint8Array(12 + entete.length + zip.length)
  sortie.set([0x43, 0x72, 0x32, 0x34])
  const v = new DataView(sortie.buffer)
  v.setUint32(4, 3, true)
  v.setUint32(8, entete.length, true)
  sortie.set(entete, 12)
  sortie.set(zip, 12 + entete.length)
  return { octets: sortie, id: idDepuisCle(der.toString('base64')) }
}

