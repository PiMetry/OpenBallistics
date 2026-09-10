/**
 * Run the interior solver from outside the app.
 *
 * `npx vite-node scripts/interior-cli.ts < load.json > result.json`
 *
 * Exists so that a comparison against some *other* solver can be run without either of them
 * knowing about the other. Reads one JSON object - or an array of them, which is how a charge
 * ladder is given - and writes the solved result for each.
 *
 * The input is `Load` from `@lib/interior` with the same units (SI throughout: kg, m, m³, Pa),
 * plus an optional `formFunction` naming one of the built-in shapes:
 *
 * ```jsonc
 * {
 *   "label": "whatever you want to call this one",
 *   "formFunction": { "kind": "degressive", "exponent": 0.667 },
 *   "propellant": { "name": "…", "impetusJPerKg": 830000, … },
 *   "chargeKg": 0.00028,
 *   "projectile": { "massKg": 0.00804, "boreAreaM2": 6.261e-5 },
 *   "chamber": { "freeVolumeM3": 4.2e-7, "travelM": 0.1 },
 *   "startPressurePa": 1.5e7,
 *   "chargeMassFraction": 0.75
 * }
 * ```
 *
 * A refusal is reported as `{ "label": …, "refused": "why" }` rather than killing the run: a
 * ladder whose top step will not fit in the case should still report the steps that do.
 *
 * The series is not written by default - a solved shot is thousands of points and a comparison
 * wants the summary - so pass `--points` if the curve itself is wanted.
 */

import { readFileSync } from 'node:fs';
import {
  CONSTANT_SURFACE,
  degressive,
  piecewiseLinear,
  solve,
  tabulated,
  tubular,
  type FormFunction,
  type Load
} from '@lib/interior';

interface FormSpec {
  kind?: 'constant' | 'degressive' | 'tubular' | 'piecewise' | 'table';
  exponent?: number;
  theta?: number;
  breaks?: number[];
  /** `[[z, phi], ...]` for `kind: "table"` - a measured curve. */
  table?: [number, number][];
  intercepts?: number[];
  slopes?: number[];
  name?: string;
}

function formFrom(spec: FormSpec | undefined): FormFunction | undefined {
  if (!spec || !spec.kind || spec.kind === 'constant') return undefined;
  if (spec.kind === 'degressive') return degressive(spec.exponent);
  if (spec.kind === 'tubular') return tubular(spec.theta);
  if (spec.kind === 'table') return tabulated(spec.table ?? [], spec.name ?? 'measured');
  if (spec.kind === 'piecewise') {
    return piecewiseLinear(
      spec.breaks ?? [],
      spec.intercepts ?? [1],
      spec.slopes ?? [0],
      spec.name ?? 'piecewise'
    );
  }
  return CONSTANT_SURFACE;
}

function main(): number {
  const args = process.argv.slice(2);
  const wantPoints = args.includes('--points');
  const fileArg = args.find((a) => !a.startsWith('--'));
  const text = fileArg ? readFileSync(fileArg, 'utf8') : readFileSync(0, 'utf8');

  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    process.stderr.write(`input is not JSON: ${String(error)}\n`);
    return 2;
  }

  const loads = (Array.isArray(input) ? input : [input]) as (Load & {
    label?: string;
    formFunction?: FormSpec;
  })[];

  const out = loads.map((entry) => {
    const label = entry.label ?? '';
    try {
      const solved = solve(entry, { formFunction: formFrom(entry.formFunction) });
      return {
        label,
        chargeKg: entry.chargeKg,
        peakPressurePa: solved.peakPressurePa,
        peakAtM: solved.peakAtM,
        muzzleVelocityMps: solved.muzzleVelocityMps,
        muzzleTimeS: solved.muzzleTimeS,
        burnedAtMuzzle: solved.burnedAtMuzzle,
        formFunction: solved.formFunction,
        caveats: solved.caveats,
        ...(wantPoints ? { points: solved.points } : {})
      };
    } catch (error) {
      // A refusal is an answer about this step, not a reason to abandon the ladder.
      return { label, chargeKg: entry.chargeKg, refused: error instanceof Error ? error.message : String(error) };
    }
  });

  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
  return 0;
}

process.exit(main());
