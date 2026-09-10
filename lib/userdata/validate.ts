/** Structural checks at the import boundary. Never repair a backup by dropping records. */
type Object_ = Record<string, unknown>;
const object = (v: unknown): v is Object_ => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const date = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
const origin = (v: unknown) => ['measured', 'estimated', 'imported'].includes(String(v));
const optional = (v: Object_, key: string, check: (value: unknown) => boolean) =>
  v[key] === undefined || check(v[key]);

function mark(v: unknown): boolean {
  if (!object(v)) return false;
  if (v.kind === 'line') return ['horizontal', 'vertical'].includes(String(v.axis)) &&
    [v.at, v.from, v.to, v.width].every(number);
  if (!number(v.x) || !number(v.y)) return false;
  if (v.kind === 'dot') return number(v.diameter);
  if (v.kind === 'circle') return number(v.diameter) && number(v.width);
  if (v.kind === 'label') return text(v.text) && number(v.size);
  return false;
}

function rifle(v: Object_): boolean {
  if (!optional(v, 'kind', k => ['rifle', 'pistol', 'revolver', 'shotgun', 'airgun', 'other'].includes(String(k)))) return false;
  if (!object(v.cartridge) || !text(v.cartridge.key) || !object(v.barrel) || !number(v.barrel.lengthMm)) return false;
  if (!optional(v.cartridge, 'snapshot', s => object(s) && text(s.name) && text(s.family) && date(s.capturedAt) && object(s.fields) && Object.values(s.fields).every(number))) return false;
  for (const key of ['twistMm', 'landDiaMm', 'grooveDiaMm', 'grooves', 'grooveWidthMm']) {
    if (!optional(v.barrel, key, number)) return false;
  }
  if (!optional(v.barrel, 'twistHand', x => x === 'left' || x === 'right')) return false;
  if (!optional(v, 'scope', s => object(s) && ['moa', 'mrad'].includes(String(s.clickUnit)) &&
    number(s.clickValue) && number(s.heightOverBoreMm) && number(s.zeroDistanceM))) return false;
  return optional(v, 'muzzleVelocity', m => object(m) && number(m.value) && text(m.unit) &&
    object(m.source) && origin(m.source.kind) && date(m.source.date));
}

const validators: Record<string, (v: Object_) => boolean> = {
  rifles: rifle,
  cartridges: v => text(v.key) && text(v.family) && object(v.fields) && origin(v.origin),
  reticles: v => ['FFP', 'SFP'].includes(String(v.focalPlane)) &&
    ['moa', 'mrad'].includes(String(v.unit)) && Array.isArray(v.marks) && v.marks.every(mark) &&
    optional(v, 'ratedMagnification', number) && origin(v.origin),
  targetFaces: v => number(v.distanceM) && v.distanceM > 0 && Array.isArray(v.rings) && v.rings.length > 0 &&
    v.rings.every(r => object(r) && number(r.score) && number(r.diameterMm) && r.diameterMm > 0) &&
    object(v.cardMm) && number(v.cardMm.width) && v.cardMm.width > 0 && number(v.cardMm.height) && v.cardMm.height > 0 &&
    optional(v, 'innerTenMm', number) && optional(v, 'blackMm', number) &&
    optional(v, 'whiteCentreMm', number) && optional(v, 'tenIsWhiteDot', x => typeof x === 'boolean') &&
    optional(v, 'scoringMethod', x => x === 'centre') && origin(v.origin)
};

export function validateSections(data: Object_): string | null {
  for (const [section, validate] of Object.entries(validators)) {
    const records = data[section];
    if (records === undefined) continue; // Early v1 exports omitted newer sections.
    if (!Array.isArray(records)) return `The ${section} section must be a list.`;
    const ids = new Set<string>();
    for (const [index, value] of records.entries()) {
      const label = `${section}, record ${index + 1}`;
      if (!object(value) || !text(value.id) || !value.id.trim() || !text(value.name) ||
        !date(value.created) || !date(value.updated) || !optional(value, 'notes', text) || !validate(value)) {
        return `Invalid ${label}. Check its fields and timestamps; nothing has been imported.`;
      }
      if (ids.has(value.id)) return `Duplicate id in ${label}: ${value.id}. Nothing has been imported.`;
      ids.add(value.id);
    }
  }
  for (const key of ['loads', 'sessions']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) return `The ${key} section must be a list.`;
  }
  if (data.settings !== undefined && !object(data.settings)) return 'The settings section must be an object.';
  return null;
}
