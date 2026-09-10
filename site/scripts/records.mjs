// Dataset locations and cartridge families shared by the build and development server.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Repository and dataset roots. */
export const ROOT = join(here, '..', '..');
export const DATA = join(ROOT, 'data');
export const CARTRIDGES = join(DATA, 'cartridges');

/** Cartridge families under data/cartridges/. */
export const FAMILIES = ['belted', 'pistol', 'rimfire', 'rimless', 'rimmed', 'shotshell'];
