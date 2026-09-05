import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { EXCLUDE, FAMILIES } from './scripts/records.mjs';

// `base` must match the Pages path or every hashed asset 404s on a project page. It is read from
// the environment so the workflow can set it from the repository name and a fork does not have to
// edit this file. Locally it stays '/', which is what `vite dev` and a user Page both want.
const base = process.env.PAGES_BASE ?? '/';

/**
 * Serve and ship the dataset.
 *
 * The site reads the records straight from the repository root, where the dataset is -- there is
 * one copy of them. Vite serves one `public/` directory and nothing else, so this plugin does the
 * two things `public/` would have done: answers `/<family>/<key>.json` in the dev server from the
 * root, and copies the family directories into `dist/` at the end of a build, which is how the
 * Pages workflow gets them into the deployed site. The records in `EXCLUDE` are left out of both,
 * as they are left out of the index: excluded means not indexed, not served, and not shipped,
 * and the dataset at the root still carries them.
 */
function records(): Plugin {
  const root = resolve(__dirname, '..');
  const app = resolve(__dirname);
  const excluded = (file: string) => file.slice(0, -5) in EXCLUDE;
  return {
    name: 'records',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const match = url.match(/^\/([a-z]+)\/([A-Za-z0-9_.-]+\.json)$/);
        // The bullet catalogue is served like a family: its own directory at the root.
        if (!match || !(FAMILIES.includes(match[1]) || match[1] === 'bullets') || excluded(match[2])) return next();
        const file = join(root, match[1], match[2]);
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      // The notices travel with the thing they are notices for. The built site serves other
      // people's files -- the flags, and Svelte's runtime inside the bundle -- and the MIT licence
      // asks that its notice be included with the copies, which a file in the repository alone
      // does not do for somebody who only ever sees the deployed page.
      const notices = join(root, 'THIRD-PARTY.md');
      if (existsSync(notices)) {
        mkdirSync(join(app, 'dist'), { recursive: true });
        copyFileSync(notices, join(app, 'dist', 'THIRD-PARTY.md'));
      }
      for (const family of [...FAMILIES, 'bullets']) {
        const source = join(root, family);
        if (!existsSync(source)) continue;
        const target = join(app, 'dist', family);
        mkdirSync(target, { recursive: true });
        for (const file of readdirSync(source)) {
          if (!file.endsWith('.json') || excluded(file)) continue;
          copyFileSync(join(source, file), join(target, file));
        }
      }
    }
  };
}

export default defineConfig({
  base,
  plugins: [svelte(), records()],
  build: { target: 'es2022', outDir: 'dist', assetsDir: 'assets' }
});
