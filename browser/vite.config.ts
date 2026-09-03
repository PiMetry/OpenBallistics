import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `base` must match the Pages path or every hashed asset 404s on a project page. It is read from
// the environment so the workflow can set it from the repository name and a fork does not have to
// edit this file. Locally it stays '/', which is what `vite dev` and a user Page both want.
const base = process.env.PAGES_BASE ?? '/';

/** The case families: the browser's own record directories, `browser/<family>/`. */
const FAMILIES = ['belted', 'pistol', 'rimfire', 'rimless', 'rimmed', 'shotshell'];

/**
 * Serve and ship the record directories.
 *
 * The site's copies of the records live at `browser/<family>/` -- beside `src/`, mirroring the
 * dataset's own layout at the repository root -- rather than under `public/`, so a reader of the
 * repository finds the site's records where the dataset's are. Vite serves one `public/`
 * directory and nothing else, so this plugin does the two things `public/` would have done:
 * answers `/<family>/<key>.json` in the dev server, and copies the directories into `dist/` at
 * the end of a build.
 */
function records(): Plugin {
  const root = resolve(__dirname);
  return {
    name: 'records',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const match = url.match(/^\/([a-z]+)\/([A-Za-z0-9_.-]+\.json)$/);
        if (!match || !FAMILIES.includes(match[1])) return next();
        const file = join(root, match[1], match[2]);
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      for (const family of FAMILIES) {
        const source = join(root, family);
        if (existsSync(source)) cpSync(source, join(root, 'dist', family), { recursive: true });
      }
    }
  };
}

export default defineConfig({
  base,
  plugins: [svelte(), records()],
  build: { target: 'es2022', outDir: 'dist', assetsDir: 'assets' }
});
