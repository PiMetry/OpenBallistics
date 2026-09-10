/** Regenerate illustrative catalogue records; these are not manufacturer specifications. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bulletFromRecord } from '../../lib/render2d/bulletDrawing';

// A curated set of common cartridge calibers, not a sales or popularity ranking.
export const SAMPLE_CALIBERS = [
  ['22_long_rifle', '.22 LR', true], ['17_hmr', '.17 HMR', false],
  ['223_rem', '.223 Remington', false], ['243_win', '.243 Winchester', false],
  ['25_06_rem', '.25-06 Remington', false], ['6_5_creedmoor', '6.5 Creedmoor', false],
  ['270_win', '.270 Winchester', false], ['7_mm_rem_mag', '7 mm Remington Magnum', false],
  ['308_win', '.308 Winchester', false], ['30_06_spring', '.30-06 Springfield', false],
  ['300_win_mag', '.300 Winchester Magnum', false], ['7_62_x_39', '7.62 x 39', false],
  ['303_british', '.303 British', false], ['8_x_57_is', '8 x 57 IS', false],
  ['338_lapua_mag', '.338 Lapua Magnum', false], ['35_rem', '.35 Remington', false],
  ['9_3_x_62', '9.3 x 62', false], ['375_h_h_mag', '.375 H&H Magnum', false],
  ['45_70_govt', '.45-70 Government', true], ['9_mm_browning_court', '.380 ACP', true],
  ['9_mm_luger', '9 mm Luger', true], ['38_special', '.38 Special', true],
  ['357_magnum', '.357 Magnum', true], ['40_s_w', '.40 S&W', true],
  ['45_auto', '.45 ACP', true]
] as const;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const catalogue = JSON.parse(await readFile(resolve(root, 'site/src/lib/index.generated.json'), 'utf8'));
const round = (value: number) => Number(value.toFixed(4));

for (const [cartridgeKey, calibre, compact] of SAMPLE_CALIBERS) {
  const cartridge = catalogue.find((entry: { key: string }) => entry.key === cartridgeKey);
  if (!cartridge?.G1) throw new Error(`Missing caliber diameter: ${cartridgeKey}`);
  for (const [variant, factor] of [['A', 0.9], ['B', 1], ['C', 1.1]] as const) {
    const diameter = cartridge.G1;
    const length = round(diameter * (compact ? 1.8 : 3.2) * factor);
    const mass = round(diameter ** 3 * (compact ? 0.012 : 0.020) * factor);
    const key = `sample_${cartridgeKey}_${variant.toLowerCase()}`;
    const record = {
      key, sample: true, sampleFor: cartridgeKey,
      manufacturer: 'Open Ballistics', line: 'Samples', model: `SAMPLE-${variant}`,
      name: `${calibre} — Sample ${variant}`, calibre, diameter, mass, length,
      bearing: round(length * 0.45), nose: round(length * 0.55), meplat: round(diameter * 0.15),
      base: { type: 'flat' }, ogive: { form: compact ? 'elliptical' : 'tangent' },
      tip: { type: 'flat' },
      construction: { jacket: 'fmj', core: 'solid_lead', jacket_material: 'GILDING_METAL', core_material: 'LEAD' },
      ballistics: { g1: round(0.25 * factor), note: 'Synthetic demonstration coefficient; not measured or published performance.' },
      sources: [],
      notes: 'Synthetic sample for exploring drawings and software features. Dimensions, mass, construction and ballistic values are illustrative, not specifications for a real product.'
    };
    const { bullet, assumed } = bulletFromRecord(record);
    const massGrains = mass / 0.06479891;
    const derived = {
      length: bullet.length, bearing: bullet.cylinder.endZ - bullet.cylinder.startZ,
      nose: bullet.tipZ - bullet.ogive.startZ, boatTail: 0, baseDiameter: diameter,
      boatTailAngle: null, meplat: bullet.tip.meplatDiameter,
      ogiveRadiusCalibres: round(bullet.ogive.radiusCalibres),
      massGrains: round(massGrains), sectionalDensity: round(massGrains / 7000 / (diameter / 25.4) ** 2),
      assumed
    };
    await writeFile(resolve(root, 'data/bullets', `${key}.json`), JSON.stringify({ ...record, derived }, null, 2) + '\n');
  }
}
console.log(`Generated ${SAMPLE_CALIBERS.length * 3} sample bullets for ${SAMPLE_CALIBERS.length} calibers.`);
