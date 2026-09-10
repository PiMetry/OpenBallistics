/**
 * Names the reader sees, in the reader's language.
 *
 * This used to be `types.ts` and re-exported `@lib/core/types` wholesale, which made every
 * consumer of a dataset type look like a consumer of the app. The types come from `@lib/core`
 * now; what is left here is what genuinely cannot move, because it needs the i18n store.
 */

import { t } from './i18n.svelte';
import { FAMILIES } from '@lib/core/types';

/**
 * What a case family is called, in the reader's language.
 *
 * A family the dataset grows and this list has not heard of is shown by its own name rather than
 * hidden or guessed at, which is what the old map did by falling through.
 */
export function familyLabel(family: string): string {
  return FAMILIES.includes(family) ? t(`family.${family}`) : family;
}
