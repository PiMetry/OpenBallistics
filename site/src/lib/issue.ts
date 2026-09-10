/** Prefilled OpenBallistics issue links with the current page and record context. */

import type { BulletEntry } from './bullets';
import type { Entry } from '@lib/core';

import { REPOSITORY_URL } from './repository';

/** A report from any page. Only the public page and selected catalogue context are included. */
export function pageIssueUrl(page: string, context: string): string {
  return formUrl('site-feedback.yml', '', `Site: ${context.split('\n')[0]!.slice(0, 100)}`, {
    page: page.slice(0, 1800), context: context.slice(0, 1800)
  });
}

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
 * Where to send a report about one bullet of the catalogue; the form is `bullet.yml`.
 */
export function bulletIssueUrl(bullet: BulletEntry): string {
  const named = `${bullet.manufacturer} ${bullet.name} (${bullet.key})`;
  return formUrl('bullet.yml', 'bullet', `${named}: `, {
    bullet: named,
    page: `${location.origin}${location.pathname}#/b/${encodeURIComponent(bullet.key)}`
  });
}

function pageUrl(entry: Entry): string {
  return `${location.origin}${location.pathname}#/c/${encodeURIComponent(entry.key)}`;
}

export function formUrl(template: string, labels: string, title: string, fields: Record<string, string>): string {
  const params = new URLSearchParams({ template, labels, title, ...fields });
  return `${REPOSITORY_URL}/issues/new?${params}`;
}
