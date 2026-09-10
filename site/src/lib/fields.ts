/**
 * The app's view of the field tables.
 *
 * The order tables, the sheet notation and the two orderings that need neither are
 * `@lib/core/fields`, re-exported here so existing importers keep working. What stays is what
 * needs the reader's language: a group's title, and the group ordering that carries it.
 */

import { t } from './i18n.svelte';
import { GROUP_ORDER } from '@lib/core/fields';

const GROUPS = new Set([...GROUP_ORDER.cartridge, ...GROUP_ORDER.chamber]);

/** What a group of figures is called. A group the dataset grows keeps its own name. */
export function groupTitle(name: string): string {
  return GROUPS.has(name) ? t(`group.${name}`) : name;
}

export function orderedGroups(
  side: 'cartridge' | 'chamber',
  record: Record<string, unknown>
): [string, string][] {
  const known = GROUP_ORDER[side].filter((name) => name in record);
  const placed = new Set(known);
  const rest = Object.keys(record).filter((name) => !placed.has(name)).sort();
  return [...known, ...rest].map((name) => [name, groupTitle(name)] as [string, string]);
}
