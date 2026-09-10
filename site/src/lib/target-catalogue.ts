import type { TargetFace } from '@lib/targets';
import type { StoredTargetFace } from '@lib/userdata';
const published = import.meta.glob<TargetFace>('../../../data/targets/*.json', { eager: true, import: 'default' });
export const TARGET_FACES = Object.values(published)
  .filter(face => ['BDS', 'DSB'].includes(face.source.body))
  .sort((a, b) => a.source.body.localeCompare(b.source.body) || a.distanceM - b.distanceM || a.name.localeCompare(b.name));
export function asTargetFace(own: StoredTargetFace, body: string): TargetFace {
  return { ...own, note: own.notes, source: { body, rulebook: '-', edition: '-', rule: '-', retrieved: own.updated.slice(0, 10) } };
}
