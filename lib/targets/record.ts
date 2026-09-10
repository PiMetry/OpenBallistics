import type { TargetFace } from './types';

export type TargetGeometry = Pick<TargetFace, 'name' | 'distanceM' | 'rings' | 'cardMm' | 'blackMm' | 'whiteCentreMm' | 'innerTenMm' | 'tenIsWhiteDot' | 'scoringMethod' | 'note'>;

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Shared boundary for the target editor and individual JSON imports. */
export function isTargetGeometry(v: unknown): v is TargetGeometry {
  if (!object(v) || typeof v.name !== 'string' || !v.name.trim() || !positive(v.distanceM)) return false;
  if (!Array.isArray(v.rings) || v.rings.length < 1 || v.rings.length > 10) return false;
  if (!v.rings.every(r => object(r) && Number.isInteger(r.score) && Number(r.score) >= 1 && Number(r.score) <= 10 && positive(r.diameterMm))) return false;
  const rings = [...v.rings].sort((a, b) => b.score - a.score);
  if (rings.some((r, i) => i > 0 && (r.score === rings[i - 1].score || r.diameterMm <= rings[i - 1].diameterMm))) return false;
  const outer = rings[rings.length - 1].diameterMm as number;
  if (v.cardMm !== undefined && (!object(v.cardMm) || !positive(v.cardMm.width) || !positive(v.cardMm.height) || Math.min(v.cardMm.width, v.cardMm.height) < outer)) return false;
  for (const key of ['blackMm', 'whiteCentreMm', 'innerTenMm']) {
    if (v[key] !== undefined && (!positive(v[key]) || Number(v[key]) > outer)) return false;
  }
  if (v.whiteCentreMm !== undefined && Number(v.whiteCentreMm) > Number(v.blackMm ?? 0)) return false;
  if (v.innerTenMm !== undefined && (!rings.some(r => r.score === 10) || Number(v.innerTenMm) > rings.find(r => r.score === 10)!.diameterMm)) return false;
  return (v.scoringMethod === undefined || v.scoringMethod === 'centre') &&
    (v.tenIsWhiteDot === undefined || typeof v.tenIsWhiteDot === 'boolean') &&
    (v.note === undefined || typeof v.note === 'string');
}

/** Import geometry as a personal record; publisher attribution stays with catalogue records. */
export function parseTargetGeometry(text: string): TargetGeometry | null {
  try {
    const input: unknown = JSON.parse(text);
    if (!isTargetGeometry(input)) return null;
    return {
      name: input.name.trim(), distanceM: input.distanceM,
      rings: input.rings.map(r => ({ score: r.score, diameterMm: r.diameterMm })).sort((a, b) => b.score - a.score),
      cardMm: input.cardMm, blackMm: input.blackMm, whiteCentreMm: input.whiteCentreMm,
      innerTenMm: input.innerTenMm, tenIsWhiteDot: input.tenIsWhiteDot,
      scoringMethod: input.scoringMethod, note: input.note
    };
  } catch { return null; }
}
