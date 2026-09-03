import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// What readers have confirmed against the sheets, promoted once three of them agree.
//
// The confirmations are written to `verifications.json` at the repository root -- one entry per
// record, saying what was confirmed and by whom -- and **not into the records**. The records are
// produced upstream (BallisticViz's `build_dist.py`) and copied here by its sync, which mirrors
// them exactly; a flag written into a record here would be overwritten by the next sync. The
// upstream build reads this file instead and merges each entry into the record's `annotations`
// (`confidence: verified`, `defaultBullet.verified`), so the round trip closes: confirm here,
// build there, sync back with the flag in place.

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const families = ['belted', 'pistol', 'rimfire', 'rimless', 'rimmed', 'shotshell'];
const issuesPath = process.argv[2] ?? join(root, 'verification-issues.json');
const summaryPath = process.argv[3] ?? join(root, 'verification-pr.md');
const verificationsPath = join(root, 'verifications.json');
const threshold = 3;

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
const confirmations = new Map();

for (const issue of issues) {
  const target = field(issue.body, 'What did you verify?').toLowerCase();
  const cartridge = field(issue.body, 'Cartridge');
  const key = /\(([^()]+)\)/.exec(cartridge)?.[1];
  const author = issue.author?.login;
  if (!key || !author || (target !== 'cartridge' && target !== 'bullet')) continue;

  const groupKey = `${key}:${target}`;
  const group = confirmations.get(groupKey) ?? { key, target, users: new Map() };
  group.users.set(author, issue);
  confirmations.set(groupKey, group);
}

let verifications = {};
try {
  verifications = JSON.parse(await readFile(verificationsPath, 'utf8'));
} catch {
  // No confirmations yet.
}

const changes = [];
for (const group of confirmations.values()) {
  if (group.users.size < threshold) continue;
  if (!(await recordExists(group.key))) continue;

  const entry = (verifications[group.key] ??= {});
  if (entry[group.target] === true) continue;
  entry[group.target] = true;
  entry.by = [...new Set([...(entry.by ?? []), ...group.users.keys()])].sort();
  entry.issues = [
    ...new Set([...(entry.issues ?? []), ...[...group.users.values()].map((issue) => `#${issue.number}`)])
  ];
  changes.push({
    key: group.key,
    target: group.target,
    users: [...group.users.keys()],
    issues: [...group.users.values()].map((issue) => `#${issue.number}`)
  });
}

if (changes.length) {
  const sorted = Object.fromEntries(Object.entries(verifications).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(verificationsPath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

const lines = [
  '## Automated verification',
  '',
  'These records reached three independent GitHub contributors through verification issues:',
  '',
  ...changes.map(
    (change) => `- ${'`'}${change.key}${'`'}: ${change.target} verified by ${change.users.map((user) => `@${user}`).join(', ')} (${change.issues.join(', ')})`
  ),
  '',
  'Recorded in `verifications.json`; the upstream build merges it into the records on the next sync.',
  ''
];
await writeFile(summaryPath, lines.join('\n'), 'utf8');
console.log(`promote-verifications: ${changes.length} record(s) qualified`);
