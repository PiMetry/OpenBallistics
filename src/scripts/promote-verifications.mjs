import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// What readers have said about the sheets, counted facet by facet.
//
// The votes are written to `verifications.json` at the repository root -- one entry per record,
// saying what was voted on, which way, and by whom -- and **not into the records**. The records
// are produced upstream (BallisticViz's `build_dist.py`) and copied here by its sync, which
// mirrors them exactly; a flag written into a record here would be overwritten by the next sync.
// The upstream build reads this file instead and merges each verdict into the record's
// `annotations` (`confidence: verified`, `defaultBullet.verified`), so the round trip closes: vote
// here, build there, sync back with the verdict in place.
//
// **A score, not a count** (decided 2026-09-04). A facet used to be promoted once three people
// filed an issue about it, and a report that said "this is wrong" counted exactly as much as one
// that said "this is right" -- the script never read the verdict, only the author. Now each vote
// is an approval or a rejection, the facet's score is approvals minus rejections, and the verdict
// is that score reaching `threshold`. So one reader finding a fault does not merely fail to
// confirm the facet: it costs an approval, and a fourth reader has to agree before the site marks
// it.
//
// **The open issues are the whole ballot box.** The workflow passes every open issue labelled
// `verification`, so this recomputes each facet from scratch rather than adding to what the file
// already holds. That is what makes a vote withdrawable -- close your issue and it stops counting,
// and a facet that loses its majority loses the mark. The file is never edited by hand.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const families = ['belted', 'pistol', 'rimfire', 'rimless', 'rimmed', 'shotshell'];
const issuesPath = process.argv[2] ?? join(root, 'verification-issues.json');
const summaryPath = process.argv[3] ?? join(root, 'verification-pr.md');
const verificationsPath = join(root, 'verifications.json');
const threshold = 3;

/**
 * What the form's wording means, facet by facet.
 *
 * The dropdown offers prose and the site's `Facet` type is camel case, and until 2026-09-04 the
 * script compared the two directly: `target !== 'cartridge' && target !== 'bullet'` skipped the
 * issue. Those two happen to be the same word in both vocabularies, so they worked and the other
 * three -- the chamber and both drawings -- were dropped on the floor. A reader filed the issue,
 * the site invited them to, and nothing ever happened. The map is the fix, and it is the only
 * place the two vocabularies meet; `verifyUrl` in `src/src/lib/issue.ts` prefills the same words
 * from `FACET_LABELS`, so a facet renamed there has to be renamed here.
 */
const FACETS = new Map([
  ['cartridge', 'cartridge'],
  ['chamber', 'chamber'],
  ['cartridge drawing', 'cartridgeDrawing'],
  ['chamber drawing', 'chamberDrawing'],
  ['bullet', 'bullet']
]);

// A field's value from a GitHub issue-form body: the block under its `### <label>` heading, read
// up to the next heading.
//
// Matched as text rather than as a pattern. One of the labels is `What did you verify?`, and
// dropped into a regular expression unescaped its `?` made the preceding `y` optional -- so the
// heading never matched, every issue parsed as having no target, and nothing was ever promoted.
function field(body, label) {
  const text = (body ?? '').split('\r\n').join('\n');
  const heading = `### ${label}\n`;
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf('\n### ');
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

/**
 * Which way a vote went.
 *
 * The verdict dropdown was added with the score; an issue filed before it has no such field, and
 * those are read as approvals because that is what the form meant at the time -- it asked readers
 * to confirm a record, and a reader who found a fault was told to file a data report instead.
 * Anything that is neither wording is an approval too: the alternative is discarding a real
 * reader's real check over a form change.
 */
function verdict(body) {
  const said = field(body, 'Does it agree with the source?').toLowerCase();
  return said.startsWith('it does not') ? 'reject' : 'approve';
}

async function recordExists(key) {
  for (const family of families) {
    try {
      await readFile(join(root, family, `${key}.json`));
      return true;
    } catch {
      // The key can belong to any case family.
    }
  }
  return false;
}

const issues = JSON.parse(await readFile(issuesPath, 'utf8'));
const ballots = new Map();

for (const issue of issues) {
  const target = field(issue.body, 'What did you verify?').toLowerCase();
  const facet = FACETS.get(target);
  const cartridge = field(issue.body, 'Cartridge');
  const key = /\(([^()]+)\)/.exec(cartridge)?.[1];
  const author = issue.author?.login;
  if (!key || !author || !facet) continue;

  const groupKey = `${key}:${facet}`;
  const group = ballots.get(groupKey) ?? { key, facet, users: new Map() };
  // One vote per person per facet. A reader who files twice has changed their mind or corrected a
  // typo, and the later issue is the one they meant.
  group.users.set(author, { issue, vote: verdict(issue.body) });
  ballots.set(groupKey, group);
}

let previous = {};
try {
  previous = JSON.parse(await readFile(verificationsPath, 'utf8'));
} catch {
  // No votes yet.
}

// A run that sees no issues at all is a query that failed, not an electorate that changed its
// mind. Recomputing from nothing would silently unverify every record in the file, so it refuses.
if (!issues.length && Object.keys(previous).length) {
  console.error('promote-verifications: no issues passed but verifications.json is not empty; refusing to clear it');
  process.exit(1);
}

const verifications = {};
const changes = [];
for (const group of [...ballots.values()].sort((a, b) => a.key.localeCompare(b.key) || a.facet.localeCompare(b.facet))) {
  if (!(await recordExists(group.key))) continue;

  const votes = [...group.users.values()];
  const approve = votes.filter((cast) => cast.vote === 'approve').length;
  const reject = votes.length - approve;
  const verified = approve - reject >= threshold;

  const entry = (verifications[group.key] ??= {});
  entry[group.facet] = {
    approve,
    reject,
    verified,
    by: [...group.users.keys()].sort(),
    issues: votes.map((cast) => `#${cast.issue.number}`).sort()
  };

  const before = previous[group.key]?.[group.facet];
  // The old shape was a bare `true`; anything truthy that is not an object was a verdict.
  const wasVerified = typeof before === 'object' ? before?.verified === true : before === true;
  if (wasVerified !== verified) {
    changes.push({ ...entry[group.facet], key: group.key, facet: group.facet, wasVerified });
  }
}

const sorted = Object.fromEntries(
  Object.entries(verifications).sort(([a], [b]) => a.localeCompare(b))
);
await writeFile(verificationsPath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');

const marked = changes.filter((change) => change.verified);
const revoked = changes.filter((change) => !change.verified);
const say = (change) =>
  `- \`${change.key}\`: ${change.facet}, ${change.approve} for and ${change.reject} against, from ${change.by
    .map((user) => `@${user}`)
    .join(', ')} (${change.issues.join(', ')})`;

const lines = [
  '## Automated verification',
  '',
  `A facet is marked when its approvals less its rejections reach ${threshold}.`,
  ''
];
if (marked.length) {
  lines.push('### Now verified', '', ...marked.map(say), '');
}
if (revoked.length) {
  lines.push(
    '### No longer verified',
    '',
    'These lost their majority, because a vote was withdrawn by closing its issue or because a',
    'reader found a fault.',
    '',
    ...revoked.map(say),
    ''
  );
}
lines.push(
  'Recorded in `verifications.json`; the upstream build merges the verdicts into the records on the',
  'next sync.',
  ''
);
await writeFile(summaryPath, lines.join('\n'), 'utf8');
console.log(
  `promote-verifications: ${Object.keys(sorted).length} record(s) with votes, ${marked.length} newly verified, ${revoked.length} revoked`
);
