/**
 * Entrée du `utilityProcess` de lecture d'import (jalon E, 3.4) : électron-vite la construit en
 * `out/main/import-worker.js`. N'importe jamais Electron ; le protocole vit dans `protocole.ts`.
 */
import { creerLecteur } from './protocole'
import type { Port } from './protocole'

const parent = (process as NodeJS.Process & { parentPort?: Port }).parentPort
if (parent) creerLecteur(parent)
