import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const families = ['belted', 'pistol', 'rimfire', 'rimless', 'rimmed', 'shotshell'];
const issuesPath = process.argv[2] ?? join(root, 'verification-issues.json');
const summaryPath = process.argv[3] ?? join(root, 'verification-pr.md');
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

async function recordPath(key) {
  for (const family of families) {
    const candidate = join(root, family, `${key}.json`);
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // The key can belong to any case family.
    }
  }
  return null;
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

const changes = [];
for (const group of confirmations.values()) {
  if (group.users.size < threshold) continue;

  const path = await recordPath(group.key);
  if (!path) continue;
  const record = JSON.parse(await readFile(path, 'utf8'));
  record.annotations ??= {};

  if (group.target === 'cartridge') {
    if (record.annotations.confidence === 'verified') continue;
    record.annotations.confidence = 'verified';
  } else {
    if (!record.annotations.defaultBullet || record.annotations.defaultBullet.verified === true) continue;
    record.annotations.defaultBullet.verified = true;
  }

  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  changes.push({
    path: path.slice(root.length + 1).replaceAll('\\', '/'),
    target: group.target,
    users: [...group.users.keys()],
    issues: [...group.users.values()].map((issue) => `#${issue.number}`)
  });
}

const lines = [
  '## Automated verification',
  '',
  'These records reached three independent GitHub contributors through verification issues:',
  '',
  ...changes.map(
    (change) => `- ${'`'}${change.path}${'`'}: ${change.target} verified by ${change.users.map((user) => `@${user}`).join(', ')} (${change.issues.join(', ')})`
  ),
  ''
];
await writeFile(summaryPath, lines.join('\n'), 'utf8');
console.log(`promote-verifications: ${changes.length} record(s) qualified`);
