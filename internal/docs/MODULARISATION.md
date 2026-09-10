# Modularising the non-UI code - a plan to make, before a plan to run


> **Status: done.** The migration described here was carried out on 2026-09-06/07 and this document
> is now a record of why the boundaries are where they are, not a plan. The library sits at the
> repository root in `lib/`, the Svelte app in `site/`, and the rules below are enforced by
> `site/src/lib/boundaries.test.ts` rather than by anybody remembering them - it covers
> `core, geom, shapes2d, measure2d, render2d, ballistics, optics, targets, interior, designer,
> data, userdata, geometry` and fails on a framework import, a rune, a DOM reference, a cycle, or a
> dependency pointing the wrong way along the chain.

The goal is that everything which is not strictly Svelte/frontend/UI ends up in small,
clearly-bounded libraries - 2D rendering, 2D cartridge, 2D bullet, the calculations, and so on -
each with a stated purpose and a public API, and that the Svelte app sits in its own directory
which is what GitHub Pages builds (§4b).

**Status: the migration is done; what remains is listed at the end.** The libraries are out of the
app, the boundaries are enforced by tests rather than by this document, and the Svelte app is its
own directory. What landed:

| landed | what |
|---|---|
| `site/` (was `src/`) | the Svelte app in its own directory, and all GitHub Pages builds (§4b) |
| `lib/core` | types, format, scale, drawings, fields, plates (§5a, §5c, §5d) |
| `lib/geom` | `profile` and the substrate split out of `render.ts` (§5e) |
| `lib/shapes2d` | case, chamber, bullet, shotshell |
| `lib/measure2d` | interior, fit |
| `lib/designer` | the photogrammetry, 787 lines that never touched the DOM |
| `lib/render2d` | render, technical, drawing, bulletDrawing |
| `lib/data` | powders (§5g) |
| `lib/testing` | fixture comparison helpers, which import vitest |
| `site/src/lib/boundaries.test.ts` | the rules as tests: framework-free, acyclic, **and one-way** |
| `site/scripts/analyse-modules.mjs` | the inventory the boundaries were drawn from |

**730 tests green before any of this; 837 now**, none skipped, `svelte-check` 0 errors, and the
built bundle still matches the 154 SVG regression fixtures. 31 cross-module edges, all
pointing one way, no cycles. The guard is scoped to
where the invariant already holds and is meant to be *widened as modules move*, so a boundary can
never be broken silently mid-refactor.

**Still open**, in the order worth doing:

1. **Verify a real Pages deploy.** It only runs on a push to `main`, so nothing here proves it.
   Everything else waits behind this: it is the one change that can break the published site.
2. `data.ts` and `bullets.ts` into `lib/data`, which means moving the build's generated output
   with them (§5g).
3. Retire the two re-export layers - the `geometry` facade and `site/src/lib/types.ts` - then
   measure and curate each module's public surface. In that order, and §5f says why.
4. 4b.3, whether `site/src` wants an `app/` subdirectory. The line the requirement asked for
   already exists between `site/` and `lib/`; this is tidying inside the app.

Why planning first: this touches roughly **7,700 lines of TypeScript** across every part of the
app, the tests are colocated with the code that is moving, and a half-finished module boundary is
worse than none. A refactor of this size is only safe if it is boring, and it is only boring if
the boundaries and the order are decided in advance.

---

## 1. Where the code is today

Measured 2026-09-07 under `src/src/`.

| area | files | lines | character |
|---|--:|--:|---|
| `lib/geometry/` | 17 | ~4,720 | the real engine; already *partly* modular |
| `lib/` | 18 | ~2,980 | mixed - pure logic, data loading, and two rune files |
| `routes/` | 5 | ~3,860 | pages, and where non-UI logic most likely hides |
| `components/` | 9 | ~1,590 | UI, with some drawing logic inside |
| root | 2 | ~410 | `App.svelte`, `main.ts` |

The largest single files, which are also the least likely to be one thing each:

```
routes/Designer.svelte        1,321      lib/geometry/technical.ts       808
routes/Cartridge.svelte       1,226      lib/designer.ts                 787
routes/List.svelte              692      lib/geometry/render.ts          763
routes/Bullet.svelte            404      lib/i18n.svelte.ts              743
components/LiveCartridge.svelte 392      lib/geometry/case.ts            519
```

Two things follow. `lib/geometry/` is a good foundation rather than a blank sheet - much of the
target structure already exists in embryo. And the two big route files are the main source of
work: logic living in a `.svelte` page is the thing this refactor is meant to fix.

## 2. Rules the plan must respect

- **Behaviour does not change.** This is a move, not a rewrite. Anything that looks like a bug
  found on the way gets written down, not fixed in the same commit.
- **Rune files stay put.** `lib/i18n.svelte.ts` and `lib/theme.svelte.ts` use Svelte runes; they
  are framework-coupled *by design* and must not be dragged into framework-free libraries.
  A library that imports `$state` is not a library.
- **The libraries must not import Svelte at all.** That is the test of whether the split is real.
- **Keep the publication layout consistent.** Dataset paths now live under `data/`, with
  family directories under `data/cartridges/`. Export tooling and site loaders must agree on
  these paths. The site has no local exclusion list.
- **The colocated tests are the safety net** (`geometry.test.ts`, `render.test.ts`,
  `drawing.test.ts`, `bulletDrawing.test.ts`, `designer.test.ts`, `data.test.ts`, `live.test.ts`,
  `router.test.ts`). They move with their subject and must be green at every step, never at the
  end of a batch.

## 2b. Phase 0 findings - measured, 2026-09-07

`src/scripts/analyse-modules.mjs` builds the import graph and classifies every file; the full
output is `docs/module-inventory.json`. Re-run with:

```
cd src && node scripts/analyse-modules.mjs --json ../docs/module-inventory.json
```

**52 files, 13,623 lines. 22 framework-free, 22 framework-coupled, and - the important one -
zero import cycles.** No cycles means boundaries can be drawn without untangling anything first,
which is what makes this refactor a move rather than a rewrite.

Two corrections the measurement forced, both of which changed the plan:

- **`lib/geometry/render.ts` (764) and `drawing.ts` (389) are framework-free.** A first pass
  flagged them as DOM-coupled; the word `document` appears only in *comments* explaining SVG id
  scoping. They are pure string builders. The whole `lib/geometry/` tree is therefore
  library-ready as it stands - 13 files, ~4,400 lines, nothing to disentangle.
- The graph initially missed **multi-line `import { … } from`**, the normal shape in the routes,
  which under-counted every edge. `designer.ts` looked unreferenced and is not.

The framework-coupled set outside `components/`/`routes/` is small, and only two items are real
work:

| file | lines | coupling | disposition |
|---|--:|---|---|
| `lib/i18n.svelte.ts` | 744 | runes, dom | **stays** - rune file by design |
| `lib/theme.svelte.ts` | 48 | runes, dom | **stays** - rune file by design |
| `lib/types.ts` | 209 | svelte | **split** - a types module should not import Svelte |
| `lib/drawings.ts` | 131 | svelte, dom | **split** - data access vs. component glue |
| `lib/fields.ts` | 128 | svelte | review during 0.2 |
| `lib/router.ts` | 47 | svelte | stays with the app shell |
| `main.ts` | 33 | svelte, dom | entry point, stays |

Migration order follows the inbound counts: leaves first (`format` ←1, `fit` ←1, `powders` ←1),
the heavily-depended-on barrels last (`geometry/index.ts` ←14, `profile.ts` ←12).

## 3. Phase 0 - the planning phase (do this, and only this, first)

- [x] **0.1 Symbol inventory** - done, §2b. `src/scripts/analyse-modules.mjs`, output in
      `docs/module-inventory.json`: exports, imports and the three coupling flags per file.
- [x] **0.2 Extractable logic in the routes** - read, 2026-09-07. Findings in §5d. Short version:
      the two files are 2,547 lines but only 856 of those are `<script>`, and the extractable part
      is smaller than the plan assumed.
- [x] **0.3 Dependency graph** - done, §2b. **Zero cycles**, and inbound edge counts per file
      give the migration order directly.
- [x] **0.4 Draw the boundaries** - decided 2026-09-07, see §4c.
- [x] ~~**0.4 (original wording)**~~ Agree the module list and, more importantly, the permitted
      **direction of dependency** between them. A proposal is in §4 - it is a starting point to
      argue with, not a decision.
- [x] **0.5 Public API per module** - barrels added, re-export layers retired, and the surfaces
      curated against what is actually imported. See §5f and §5h.
- [x] **0.6 Migration order and mechanics.** Which module moves first (the one with fewest
      inbound edges), whether re-export shims are left behind at old paths during the move, and
      how many modules land per commit.
- [~] **0.7 Verification plan.** Half done. The **boundary guard is in place**
      (`src/src/lib/boundaries.test.ts`, 41 tests): libraries import no Svelte, use no runes,
      touch no DOM, and stay acyclic - widen `LIBRARY_DIRS` as each module moves.
      Still to decide: a **golden-output check for the renderers**, since a silent change in an
      SVG path is exactly the failure this refactor could cause and the unit tests would not
      catch it. Fix the fixtures before `render.ts` moves.
- [x] **0.8 Write the migration plan** as a document, and **get it approved**. Phase 1 does not
      start until then.

## 4. A proposed target - to be argued with in 0.4

```
src/src/lib/
  core/          units, scale, format, shared types           (depends on nothing)
  cartridge2d/   case, chamber, profile, shotshell geometry   (-> core)
  bullet2d/      bullet geometry, bullet drawing              (-> core)
  render2d/      drawing, render, technical dimensioning      (-> core, cartridge2d, bullet2d)
  calc/          interior ballistics, fit, capacity           (-> core)
  data/          record loading, drawings index, bullets, powders (-> core)
  app/           router, issue, live - glue, still Svelte-free (-> all of the above)

  i18n.svelte.ts, theme.svelte.ts    stay here: rune files, framework-coupled
src/src/components/, src/src/routes/  stay Svelte; they import downward only
```

Dependency direction is one-way, left to right in that list. `core` importing `render2d` would be
the signal that a boundary is wrong.

Open questions for 0.4, which the inventory should answer rather than taste:

- Does `technical.ts` (808 lines, dimensioning) belong in `render2d`, or is it its own module?
- Is `interior.ts` geometry (the inside of a case) or `calc`? The name is ambiguous today.
- `designer.ts` (787 lines) - how much is genuine domain logic and how much is Designer-page
  state that should stay with the page?
- Test fixture helpers belong in `lib/testing/fixtures.ts`; measurement routines belong in
  `lib/measure2d/fit.ts`.

## 4b. The Svelte app gets its own directory (GH Pages)

**Requirement:** the Svelte/UI code lives in its own directory, and GitHub Pages builds and
deploys exactly that - so the deployable site and the framework-free libraries are separable by
looking at the tree, not by reading imports.

Today the layout works but does not say this. The npm package, Vite config and app source all sit
under `src/`, and the app's own source is at `src/src/` - a directory called `src` inside a
directory called `src`, next to the dataset directories at the repository root. The Pages
workflow encodes that name in three places (`defaults.run.working-directory: src`,
`cache-dependency-path: src/package-lock.json`, and `upload-pages-artifact` `path: src/dist`).

### Plan (do before touching anything)
- [x] **4b.1 Choose the name and the shape - DECIDED: (b).** `site/` for the Svelte app, and a
      sibling `lib/` at the repository root for the framework-free libraries. The truer
      separation; the cost is that Vite must resolve outside its root and the tsconfig paths
      change. Original options kept below for the record.
- [x] ~~**4b.1 alternatives.**~~ Two candidates, and they are not equivalent:
      **(a)** rename `src/` → `site/`, keeping one npm package, libraries at `site/src/lib/*`.
      Cheap, no build changes beyond names. **(b)** `site/` for the Svelte app and a sibling
      `lib/` (or `packages/`) at the repository root for the libraries. A truer separation, but
      Vite must resolve outside its root and the tsconfig paths change. Recommend **(a)** first -
      it delivers the separation the requirement is about, and (b) stays reachable afterwards.
- [x] **4b.2 Inventory the places the name is written down** - done. Found and updated: three
      paths in `pages.yml`, two in `checks.yml`, four in
      `README.md`, three in `THIRD-PARTY.md`, **and the root `.gitignore`, which the first sweep
      missed** - its `src/public/flags/` no longer matched after the rename, so 21 generated flag
      SVGs briefly staged themselves as source.
- [x] **4b.3 Decide the UI/library line inside the app**: `src/app/` (App.svelte, main.ts,
      components/, routes/, the two rune files) beside `src/lib/*` (framework-free). This is what
      makes "Svelte is its own directory" true at file level, not just at the top.
- [x] **4b.4 Pages dry-run plan.** A rename that breaks Pages is only visible after a push to
      `main`. Decide how it is verified first - `workflow_dispatch` on a branch, or a local
      `PAGES_BASE=/OpenBallistics/ npm run build` plus an artifact-path check.

### Action (only after the plan is agreed)
- [x] **4b.5 Renamed `src/` -> `site/`.** Git records it as **66 renames**, so history follows the
      files. (`git mv` refused while stale `esbuild` workers from the test run held
      `src/node_modules`; renaming after stopping them worked.)
- [x] **4b.6 Updated every reference** listed in 4b.2, in the same working tree as the rename.
- [x] **4b.7 Verified locally.** `npm test` **771 green** (unchanged), and
      `PAGES_BASE=/OpenBallistics/ npm run build` succeeds: `/OpenBallistics/` is baked into
      `index.html`, the dataset families still copy in (the build resolves the repository root as
      `__dirname/..`, so the rename was transparent), and the artifact is at `site/dist` - what
      `upload-pages-artifact` now points at. **A real Pages deploy is still unverified**: it only
      runs on a push to `main`.
      Note the build also caught a type error in the new `boundaries.test.ts` - `svelte-check`
      runs as part of `npm run build`, so a test file can break the build. Fixed.
- [x] **4b.8** Not applicable, per 4b.2: the sync script never referenced the app directory.

### The sibling `lib/` - plumbing DONE
- [x] `lib/` created at the repository root.
- [x] **Vite**: `resolve.alias` `@lib` -> `<root>/lib`, plus `server.fs.allow: [repoRoot]` - without
      the latter the dev server refuses to read outside its own root. (`repoRoot` had to be lifted
      to module scope; the existing `root` is local to the `records()` plugin.)
- [x] **tsconfig**: `baseUrl` + `paths` for `@lib/*`, and `include` extended to `../lib/**/*.ts`
      so `svelte-check` type-checks the libraries too.
- [x] **Vitest**: `test.include` now covers `../lib` - its default is relative to the Vite root, so
      the library tests would otherwise have silently stopped running.
- [x] **The boundary guard** covers both roots and grows as modules land.
- [x] **`site/.gitignore`**: its `src/lib/*.generated.json` lines assume generated files live under
      the app; check where they should live once `lib/` is a sibling.
- [x] Decide whether `lib/` gets its own `package.json` (a workspace) or stays plain source behind
      an alias. Plain source is simpler and enough; a workspace only pays off if something else
      consumes it.

**Ordering note.** 4b is a *rename*; §5 is a *reshuffle of contents*. Doing the rename first means
every later move happens at the final path and no import is rewritten twice - but it also touches
CI, so it is the riskier half. Doing §5 first keeps CI untouched for longer. Decide in 0.6; the
recommendation is 4b first, precisely because it is the part that can break the deployment, and
breaking it early with nothing else in flight is the cheapest time to find out.

## 5a. Landed: `lib/core`

The first module, chosen because the inventory said it was a leaf. It did not move as one piece:

- **`types.ts` had to be split first.** 208 lines, of which exactly one function was coupled -
  `familyLabel()` calls the i18n store. The 12 pure exports (the dataset's shapes, `COUNTRY_NAMES`)
  moved to `lib/core/types.ts`; `familyLabel` stayed behind because a label in the reader's
  language is a presentation concern and a library may not depend on the i18n store.
  `site/src/lib/types.ts` is now **23 lines**: a re-export plus that one function, so all 15
  importers keep working untouched.
- **`format.ts` moved whole** and its single importer now says `@lib/core`. No shim left behind.
- Had `format.ts` moved first it would have dragged a dependency on the Svelte-coupled `types.ts`
  into the library - the direction rule catching a mistake before it was made.

**Evidence it changed nothing:** the built bundle hashes are byte-identical to the pre-move build
(`index-Qi_gU2x9.js`, `Cartridge-CRkr940i.js`, …). Tests 780 green, `svelte-check` 0 errors.

## 5b. Landed: `scale.ts`, and the whole `geometry/` tree

- `scale.ts` joined `core`; its nine importers now say `@lib/core`.
- **`lib/geometry/` moved whole** - 17 files, ~4,700 lines, eleven importers rewritten to
  `@lib/geometry`. It had **zero outward imports**, so the move was a pure path change. It is
  deliberately *not* yet split into `cartridge2d`/`bullet2d`/`render2d`: moving first and
  regrouping second is two small risks instead of one large one.

`render.test.ts` compares the rendering output with 154 SVG regression fixtures. These fixtures
live in `fixtures/rendering/`, so the comparisons run in standalone checkouts and CI.

Tests must continue loading their fixtures after a module move. `lib/testing/fixtures.ts` resolves
the repository root two directories above its location and defines the dataset and SVG fixture
paths. The geometry tests read profile fixtures from `fixtures/profiles/`. Compare test counts before
and after moves so a missing fixture cannot silently reduce coverage.

- The library tests could not resolve `vitest`'s types once outside `site/`, because TypeScript
  walks up from the file and never reaches `site/node_modules`. `svelte-check` failed the build;
  a `paths` entry fixes it.

**On bundle hashes:** they changed this time (they had not for `core`), and the cause is real, not
noise - the build is deterministic, and importing through the `@lib/…` barrels rather than direct
files shifts chunk boundaries. Sizes moved by 290 bytes on a 416 kB bundle (0.07 %). Worth
watching: barrel imports can pull more into a chunk than deep imports would.

### The §4 split is not buildable as written - corrected design

Mapping `lib/geometry`'s **internal** graph before moving anything showed the proposed
`cartridge2d` / `bullet2d` / `render2d` grouping would create **module-level cycles**, even though
the file graph is perfectly acyclic:

- `shotshell.ts` is a cartridge shape but imports `render.ts`; `render.ts` imports `bullet.ts` and
  `case.ts`. So `cartridge2d -> render2d -> cartridge2d`.
- `bulletDrawing.ts` imports `drawing.ts`, while `render.ts` imports `bullet.ts`. So
  `bullet2d -> render2d -> bullet2d`.

The file layering is really: `profile` -> `case` -> {`bullet`, `chamber`} -> `render` ->
`shotshell` -> `technical` -> `drawing` -> `bulletDrawing`. `render` sits in the *middle*, not on
top, because the shapes use its SVG primitives. A grouping that respects that is:

| module | files | depends on |
|---|---|---|
| `cartridge2d` | `profile`, `case`, `chamber` | - |
| `bullet2d` | `bullet` | cartridge2d |
| `assembly2d` | `interior`, `fit` | cartridge2d, bullet2d |
| `render2d` | `render`, `shotshell`, `technical`, `drawing`, `bulletDrawing` | all above |

No cycles, and no file has to be split. The cost is that `render2d` is large (~2,800 lines); the
alternative is surgery on `render.ts` to separate its SVG primitives from its drawing routines,
which would let `shotshell` and `technical` depend on the primitives alone. That is a real
improvement and a bigger, separately-verifiable change - not something to fold into a move.

**Open decision (0.4):** adopt the four-module table above, or split `render.ts` first and keep the
original three names. Also whether `lib/geometry/index.ts` survives as a façade so the eleven
external importers do not churn (two of them use deep paths, `@lib/geometry/render` and
`@lib/geometry/technical`). Recommendation: adopt the table, keep the façade, remove it in a final
commit once call sites are updated.

Next after that: the remaining coupled files, `drawings.ts` and `fields.ts`, and 0.2's reading of
the two big routes.

## 5c. Landed: `drawings.ts` and `fields.ts` split

Both were coupled to the app by exactly one thing, the i18n store, and both split the same way as
`types.ts` did:

| file | was | app keeps | moved to `lib/core` |
|---|--:|---|---|
| `drawings.ts` | 130 | 56 lines: three labels, and the remembered style (`localStorage` - which is what the `dom` flag was) | the picking logic: `plates`, `offered`, `face`, `extent`, `main`, `card`, `SUBJECTS`, `STYLES` |
| `fields.ts` | 127 | 29 lines: `groupTitle` and `orderedGroups` | `FIELD_ORDER`, `GROUP_ORDER`, `FIELD_LABELS`, `FIELD_UNITS`, `orderedColumns`, `orderedFields` |

`fields.ts` took two attempts, and the second boundary is the interesting one. The obvious split --
lift everything except the one function calling `t()` - **fails to compile**: `orderedGroups`
pairs each group with `groupTitle(name)`, so it produces text in the reader's language and belongs
with the app, and a private `FIELD_ORDER` table had to move with the orderings that read it.

Worth noting how that was caught: **the tests passed** (789 green) on the broken split, because
Vitest does not type-check. `svelte-check`, inside `npm run build`, is what failed. For a refactor
that moves declarations between files, the build is the gate, not the test run.

## 5d. 0.2 - what is actually extractable from the two routes

Read rather than assumed. `Designer.svelte` is 1,321 lines but only **486** are `<script>`;
`Cartridge.svelte` is 1,226 with **370**. The rest is markup and CSS, which is not going anywhere.

**`Designer.svelte` - little to take.** Its script is overwhelmingly DOM: pointer and wheel
handlers, `getBoundingClientRect`, file input, canvas `ImageData` in `pixels()`. The arithmetic it
is a front-end for already lives in `lib/designer.ts`. The genuinely liftable part is the *marks
model* - `markAt`, `moveMark`, `removeMark`, `setCoord`, `clearMarks` are operations on a data
structure that happen to be spelled against component state - plus whatever of `rectify()` is
projection rather than pixel-fetching. Neither is large.

**`Cartridge.svelte` - six functions worth taking**, all of them drawing/hull selection, which is
the same job `@lib/core/drawings` already does:

| function | what it is |
|---|---|
| `fitScale(widest, tallest)` | pure arithmetic |
| `hullLengths(data)` | pulls the published hull lengths out of a record |
| `defaultLength(rows, entry)` | which length to open at |
| `resolve(...)` with its `miss`/`distance` helpers | which plate answers a request |
| `panels(drawn, length, want)` | which plates to show side by side |
| `tag(row)` | a row's short marking |

Staying: `zoomKey`/`storedZoom`/`setZoom`/`zoomBy`/`storedDimensions`/`setDimensions`/`setStyle`
(browser storage), the drag handlers (DOM), and `describe`/`missingNote` (reader's language).

**Done.** The six are now `lib/core/plates.ts`, pinned by `plates.test.ts` - **20 tests**, with
the record-shaped cases read from the dataset at the repository root rather than invented, so they
cannot drift from what the dataset publishes.

One correction to the order this file proposed. "Write tests where they stand, then move" was not
possible: the six were *local to a component's `<script>`* and nothing could import them. The
order that works is move-verbatim-then-pin, and the safety it relies on is that the bodies are
copied unchanged. Only `fitScale` differs, and visibly: it read `panelWidth` and `viewportHeight`
off the component, so it now takes them, and the page binds them in a one-line wrapper rather than
every call site being edited.

`Cartridge.svelte` is **1,227 -> 1,156 lines**, and `noUnusedLocals` then found six imports the
extraction had made dead - the compiler doing the job a careful reading would have had to.

## 4c. The agreed module list (0.4)

Settled with the four answers to the questions §5b raised, plus what reading the files showed.

| module | holds | depends on |
|---|---|---|
| `core` | types, format, scale, drawings, fields, plates | - |
| `geom` | `profile` **and the SVG substrate split out of `render.ts`** | core |
| `shapes2d` | `case`, `chamber`, `bullet`, `shotshell` | geom |
| `measure2d` | `interior`, `fit`, `designer` | shapes2d |
| `render2d` | `render` (drawing half), `technical`, `drawing`, `bulletDrawing` | shapes2d, geom |
| `testing` | `fixtures` | - (test support only) |

**`technical.ts` -> `render2d`**, as directed. It does not need splitting: all 808 lines are the
dimension layer, one job.

**`render.ts` does get split**, and this is what unblocks everything. It is two layers wearing one
name: a substrate (`Viewport`, `Frame`, the stroke constants, `fmt`/`num`, `svgHeader`,
`clipPathDef`, `offsetInward`, `cutFolds`, the section-line placement) and the drawing routines
above it (`metallicParts`, `outlineParts`, `renderVisualSvg`, `sectionParts`, the chamber
renderers). The cycle that made the first plan unbuildable is entirely the shapes reaching for the
substrate: `shotshell` imports eleven names from `render.ts` and only `sectionLines` is above the
line - and that is a path generator, not a drawing. With the substrate in `geom`, `shotshell`
stays a shape and nothing points backwards.

One adjustment the reading forced: `MATERIAL_HEX_OF` and `darken` cannot go in the substrate,
because `Material` and `MATERIAL_HEX` live in `bullet.ts`. Colour helpers belong with the material
they describe, in `shapes2d`.

**`interior.ts` is geometry, not drawing.** It is the powder space - inner profile, revolved
volume, usable volume, fill level. It draws nothing. It needs a bullet only to know what the
bullet displaces, and takes it as `import type`, which is erased at compile time. It sits with
`fit.ts` in `measure2d`: both measure a loaded round rather than picture it.

**`designer.ts` is a library and always was** - its own docstring opens "Nothing here touches the
DOM". 787 lines of photogrammetry: pixels and a ruler in, a bullet record out. **Moved**, with its
eight tests.

**`lib/testing/fixtures.ts` is test scaffolding** and imports `vitest`, which no shipped module
may import. It contains fixture paths and drawing comparisons. The shared library
the question was really about is `geom`: `profile` plus the substrate, which is what every small
module actually leans on. `fit.ts` is not support either - it is measurement, and it goes with
`interior`.

### A bug this refactor keeps producing

When moving tests, check relative fixture paths and compare test counts before and after the
move. Missing fixture directories must not silently skip regression coverage. Keep shared paths
in `lib/testing/fixtures.ts` where practical.

```
lib/  core/       types, format, scale, drawings, fields, plates
      geom/       profile, svg          the substrate everything leans on
      shapes2d/   case, chamber, bullet, shotshell
      measure2d/  interior, fit
      designer/   the photogrammetry
      render2d/   render, technical, drawing, bulletDrawing
      testing/    fixtures              scaffolding; it imports vitest
      geometry/   index                 the facade, so callers need not churn yet
```

`render.ts` split first: **466 lines of substrate, 339 of drawing**. That is what let `shotshell`
stay a shape - it took eleven names from the renderer and only one was a drawing.

**The direction rule is now `boundaries.test.ts`, not a paragraph.** It reads the same order this
document states and fails on any import pointing rightwards. It exists because the one time the
rule was checked by hand, the check ran, printed one violation, and was committed over with a
message claiming there were none - `shotshell` still reached into `render2d` for `darken`. The
fix was to move `darken` and `MATERIAL_HEX_OF` to `shapes2d/bullet.ts`, where `Material` and
`MATERIAL_RGB` already were: the colour of a material is a fact about the material.

The guard sees **31 cross-module edges** and requires all of them to point left. That number is
worth keeping in view - a direction test that matched nothing would pass just as quietly.

## 5f. Why 0.5 stops at barrels

Each module now has an `index.ts`, and the `geometry` facade goes through them rather than
reaching into files. What has *not* happened is the second half of 0.5: deciding what is internal.

The obvious way to decide is to measure - read every import that crosses a module boundary and
call the rest internal. Done naively that says:

| module | exported | asked for outside | "internal" |
|---|--:|--:|--:|
| `geom` | 38 | 28 | 10 |
| `shapes2d` | 90 | 44 | **46** |
| `measure2d` | 18 | 2 | **16** |
| `render2d` | 91 | 13 | **78** |
| `core` | 40 | 11 | **29** |

**Those numbers are wrong, and acting on them would break the site.** Two re-export layers hide
the real callers: the `geometry` facade re-exports `shapes2d`, `measure2d` and `render2d`
wholesale, and `site/src/lib/types.ts` re-exports `@lib/core/types`. A symbol reached through
either is invisible to a scan of direct imports - which is why `core` appears not to need
`Entry`, `Record_` or `Drawing`, all of which the app uses constantly.

So the honest order is: retire the re-export layers first, then measure, then curate.

**The layers are now gone** - `types.ts`/`drawings.ts`/`fields.ts` in the app, the `geometry`
facade's blanket re-exports, and `render.ts`'s re-export of the whole substrate. What the same
measurement says afterwards:

| module | exported | asked for outside | before | after |
|---|--:|--:|--:|--:|
| `geom` | 38 | 28 | 28 | 28 |
| `shapes2d` | 90 | 46 | 44 | 46 |
| `measure2d` | 18 | 10 | 2 | **10** |
| `render2d` | 91 | 18 | 13 | 18 |
| `core` | 40 | 28 | 11 | **28** |

`core` and `measure2d` were the badly mismeasured ones, and both were mismeasured in the direction
that would have caused damage: 29 of `core`'s exports looked deletable and 17 of them were not.

## 5h. The surfaces, curated

The criterion is not "does it cross a module boundary" - a sibling file in the same module needs
the export too, and so does that module's own test. It is: **does any other file name it in an
import**. On that test, 117 declarations were exported for nobody.

De-exporting all 117 left the compiler to sort them, and it did: `noUnusedLocals` reported
**seven** as never read at all. Those are not encapsulation, they are dead code - and the
distinction matters, because the other 110 were being used inside their own file the whole time.

| module | exported before | after | used outside | internal |
|---|--:|--:|--:|--:|
| `geom` | 38 | **28** | 28 | **0** |
| `shapes2d` | 90 | **50** | 46 | 4 |
| `measure2d` | 18 | **11** | 10 | 1 |
| `render2d` | 91 | **42** | 18 | 24 |
| `core` | 40 | **36** | 28 | 8 |
| `designer` | 31 | 31 | 19 | 12 |

`geom` now exports exactly what is asked of it and nothing else. What is left as "internal" in
`render2d` and `designer` is almost entirely names their own tests import - which is the case the
naive boundary count could not see, and the reason the criterion had to be widened.

### Dead, and left alone deliberately

Seven declarations are used by nothing, not even their own file:

```
DELTA_ARC_MM   INK_WARNING   PRIMER_POCKET_CLEARANCE_MM   TAPER_CRIMP_DIAMETER_REDUCTION_MM
face()   offered()   toleranceFor()
```

They keep their `export`, because deleting them is a separate decision from encapsulating them.
Review their purpose before removing them; no callers were found in this inventory.

## 5g. What is left in the app, and why

Four framework-free files still sit in `site/src/lib`. Three of them stop there for a reason
rather than for want of time:

- **`powders.ts` -> `lib/data`. Moved.** No imports at all: a table of propellants and one
  function over it, with a single consumer.
- **`data.ts` and `bullets.ts` are bound to the build.** They import `index.generated.json` and
  `bullets.generated.json`, which `site/scripts/build-index.mjs` writes into `site/src/lib/`.
  Moving them means moving the build's output too, which touches the generator, both `.gitignore`
  files and the Vite JSON handling. That is a build change, and it should not be made while the
  Pages deployment is still unverified - one unproven change at a time.
- **`live.ts` and `issue.ts` are app glue** - a view's state and a URL for a form. Framework-free,
  but nothing outside this app wants them. Left where they are on purpose: a library is for what
  more than one caller needs.

## 5. Phase 1+ - execution

- [x] One module per commit, in the order 0.6 decided, tests green at each step.
- [x] Delete the re-export shims in a final commit, so the intermediate states stay bisectable.
- [x] `npm run build` and the test suite clean.
- [x] Update the README's description of the source layout.

## 6. Explicit non-goals

Rewriting the rendering approach; changing the data format or anything under a synced path;
introducing a state-management library; splitting the app into packages or a monorepo (these are
directories with boundaries, not published packages - revisit only if something else needs to
consume them); and fixing bugs noticed along the way, which get their own issues.
