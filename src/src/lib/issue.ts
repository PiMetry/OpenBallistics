/**
 * "Something is wrong with this cartridge", a link that opens a prefilled issue.
 *
 * 36 of the 540 records have been confirmed by a person against their sheets and the rest have
 * not. The gap gets closed from the inside by checking them; this is the other half, letting a
 * reader who spots a wrong figure say so from the page where they spotted it, without composing a
 * bug report from scratch.
 *
 * The prefill is deliberately small. GitHub's new-issue URL is a GET request and browsers stop
 * honouring one somewhere around 8000 characters, so a long body is the wrong place to put
 * structure. The **issue form** carries it instead, `.github/ISSUE_TEMPLATE/data.yml`, and this
 * link only fills the two fields it can know: which cartridge, and which page the reader was on.
 * The form asks the rest, including the part that matters most: *where you are reading that from*.
 * A correction is only useful if it names its source, because a claim about the data has to be
 * checkable against the sheet.
 */

import type { Entry } from './types';

/**
 * The repository issues live in, as `owner/name`.
 *
 * `VITE_REPO` overrides it at build time, and the Pages workflow sets that from whatever repository
 * is building, so a fork reports to itself rather than to whoever it was forked from. The default
 * is here so the link also works in a plain `npm run dev`: it was environment-only at first, which
 * meant the button silently did not exist in development, the sort of thing that ships broken and
 * stays broken because nobody clicks their own report link.
 */
const REPO: string = import.meta.env.VITE_REPO ?? 'PiMetry/OpenBallistics';

/**
 * Where to send a report about one cartridge.
 *
 * `template` selects the issue form. `labels=data` applies only if that label exists, because
 * GitHub drops unknown labels silently rather than erroring; the form declares it too, so the
 * label arrives either way.
 *
 * The remaining parameters are field ids from the form. GitHub matches them by id, so renaming a
 * field there without renaming it here loses the prefill silently.
 */
export function issueUrl(entry: Entry): string {
  return formUrl('data.yml', 'data', `${entry.name} (${entry.key}): `, {
    cartridge: `${entry.name} (${entry.key})`,
    page: pageUrl(entry)
  });
}

/**
 * Where to send a verification of one facet of one record.
 *
 * One link per facet, because a verification is of a facet and not of a record: somebody who has
 * held the chamber table against the sheet has not thereby checked the bullet, and a single
 * "verify this cartridge" link invites a report that claims more than was done.
 *
 * `target` is the facet's own label in lower case, which is what the form's dropdown lists.
 * GitHub selects a dropdown option by matching its text, so the two have to agree; renaming a
 * facet here without renaming the option there loses the prefill silently.
 */
function pageUrl(entry: Entry): string {
  return `${location.origin}${location.pathname}#/c/${encodeURIComponent(entry.key)}`;
}

function formUrl(template: string, labels: string, title: string, fields: Record<string, string>): string {
  const params = new URLSearchParams({ template, labels, title, ...fields });
  return `https://github.com/${REPO}/issues/new?${params}`;
}
