import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { FAMILIES, DATA, CARTRIDGES } from './scripts/records.mjs';

// `base` must match the Pages path or every hashed asset 404s on a project page. It is read from
// the environment so the workflow can set it from the repository name and a fork does not have to
// edit this file. Locally it stays '/', which is what `vite dev` and a user Page both want.
const base = process.env.PAGES_BASE ?? '/';

// Resolve the shared libraries and allow the dev server to read the repository's data/ directory.
const repoRoot = resolve(__dirname, '..');

/** Serve public dataset records and copy them into the same data/ layout in the build. */
function records(): Plugin {
  const app = resolve(__dirname);
  const collections = [
    ...FAMILIES.map(family => ({ path: `data/cartridges/${family}`, source: join(CARTRIDGES, family) })),
    ...['bullets', 'targets'].map(kind => ({ path: `data/${kind}`, source: join(DATA, kind) }))
  ];
  return {
    name: 'records',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requested = (req.url ?? '').split('?')[0];
        const url = base !== '/' && requested.startsWith(base) ? '/' + requested.slice(base.length) : requested;
        const match = url.match(/^\/(data\/(?:cartridges\/[a-z]+|bullets|targets))\/([A-Za-z0-9_.-]+\.json)$/);
        if (!match) return next();
        const collection = collections.find(item => item.path === match[1]);
        if (!collection) return next();
        const file = join(collection.source, match[2]);
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      // The notices travel with the thing they are notices for. The built site serves other
      // people's files - the flags, and Svelte's runtime inside the bundle - and the MIT licence
      // asks that its notice be included with the copies, which a file in the repository alone
      // does not do for somebody who only ever sees the deployed page.
      const notices = join(repoRoot, 'THIRD-PARTY.md');
      if (existsSync(notices)) {
        mkdirSync(join(app, 'dist'), { recursive: true });
        copyFileSync(notices, join(app, 'dist', 'THIRD-PARTY.md'));
      }
      for (const collection of collections) {
        const target = join(app, 'dist', collection.path);
        mkdirSync(target, { recursive: true });
        for (const file of readdirSync(collection.source)) {
          if (!file.endsWith('.json')) continue;
          copyFileSync(join(collection.source, file), join(target, file));
        }
      }
    }
  };
}

export default defineConfig({
  base,
  plugins: [tailwindcss(), svelte(), records()],
  optimizeDeps: { entries: ['index.html'] },
  // The framework-free libraries are a sibling of this directory, not a child of it: `site/` is
  // the Svelte app and only the Svelte app, which is what GitHub Pages builds. Vite therefore
  // has to be told both how to resolve `@lib/*` and that it is allowed to read outside its own
  // root - `fs.allow` is a dev-server guard, and without it the dev server refuses the files.
  resolve: { alias: { '@lib': resolve(repoRoot, 'lib'), '$lib': resolve(__dirname, 'src/lib') } },
  server: { fs: { allow: [repoRoot] }, watch: { ignored: ['**/*.local/**'] } },
  // Vitest's default `include` is relative to this root, so the libraries' own tests would
  // silently not run - and those tests are the safety net the modularisation depends on.
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}', '../lib/**/*.{test,spec}.{js,ts}']
  },
  // The index is a 260 kB JSON file imported by `lib/data.ts`. Left as a JavaScript object
  // literal it is parsed by the JavaScript parser, which is the slow way to read data; as one
  // `JSON.parse` of a string the engine's JSON reader takes it, several times faster, and that is
  // main-thread time before the first card that the page has no other use for.
  json: { stringify: true },
  build: {
    target: 'es2022', outDir: 'dist', assetsDir: 'assets',
    rollupOptions: {
      output: {
        // Keep the catalogue cache stable when UI components change.
        manualChunks(id) { if (id.endsWith('/src/lib/index.generated.json')) return 'catalogue-data'; }
      }
    }
  }
});
