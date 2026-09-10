# Roadmap: user data, optics, targets, and the calculators worth having

Four phases asked for on 2026-09-07, plus an answer to "what else would make sense". **None of
these is to be built yet.** Each has a research and planning gate first, for the same reason the
modularisation did: the expensive mistakes here are design mistakes, and they are cheap to find on
paper.

---

## Where this stands, 2026-09-08

**Phases A, B and C are built.** User data and its export; the exterior solver, truing, come-ups,
the GEE, reticles and target faces; the cartridge designer. All reachable from the site.

Built since, beyond the original three phases: an **interior-ballistics solver** (`lib/interior`),
and a verification chain against published manufacturer data.

Still open, in the order they are worth doing - the detail is in the sections below:

1. **Per-powder form functions** for the interior solver. The largest known error, worth up to 12 %
   per powder, and the thing blocking the solver from appearing on the site at all.
2. **IPSC/USPSA and F-Class faces**, which need a scoring-*zone* model `TargetFace` does not have.
3. **The standalone chronograph import converter** (Garmin Xero, LabRadar, MagnetoSpeed).
4. The calculators and features listed at the end, most of which are now small.

---

## The constraint that shapes all of it

**OpenBallistics is a static site on GitHub Pages. There is no server and there never will be
without a decision to run one.** That is not a limitation to work around; it decides the whole
shape of Phase A:

- No accounts, no sync, no "my data follows me to my phone".
- User data lives in the browser - `localStorage` for small things, IndexedDB for anything with
  history - and is **only as durable as that browser profile**. Clearing site data destroys it.
- Therefore **export is not a feature, it is the storage model**. A user's rifles and loads are
  theirs and must be one button away from a file they hold.

Anything in this document that implies a backend is out of scope until that decision is made
explicitly.

---

## Phase A - User data: the rifles, and getting them in and out

### What a weapon record has to hold
The catalogue already describes cartridges and chambers. A user's rifle is the other half, and the
fields are the ones a ballistic solver and a chamber drawing actually consume:

| field | why it is there |
|---|---|
| name, photo, notes | it is the user's rifle, not a specimen |
| cartridge | a reference into `cartridges/`, not a copy |
| barrel length | muzzle velocity, and the interior-ballistics travel |
| twist rate **and direction** | stability, and **spin drift is signed by it** |
| bore / groove diameter, groove count, groove width | the bore area the solver uses - the same `Aeff = π/4·F² + N·b·(Z-F)/2` the CIP sheets give |
| chamber | throat/leade, and `jumpToLands` already exists in `lib/measure2d/fit.ts` |
| scope: click unit and value, height over bore, zero distance and conditions | Phase B needs every one of these |
| measured muzzle velocity + the conditions it was measured in | truing, and it is a measurement, so it carries provenance |

### Plan first - **DONE, see [USER-DATA.md](USER-DATA.md)**
- [x] **A.1 Decide the storage.** IndexedDB with a versioned schema, or `localStorage` with a
      migration function. Whichever, decide **before** anything is written, because a schema
      change after users have data is a migration, not an edit.
- [x] **A.2 Design the export format** as the primary artefact: one JSON file, versioned, holding
      rifles, loads, chronograph sessions and settings. Human-readable, diffable, and importable
      into a later version. This is the durability story.
- [x] **A.3 Decide the reference discipline.** A rifle points at a cartridge *key*. What happens
      when the dataset renames or retires one? Snapshot the fields, or keep the reference and show
      it as unresolved - the second is honest, the first survives.
- [x] **A.4 Plan chronograph imports.** Garmin Xero, LabRadar and MagnetoSpeed CSVs are
      candidate inputs; get real files before writing a parser.
- [x] **A.5 Decide what a user may *not* do**: user records must never silently become dataset
      records. `docs/BULLETS.md`'s provenance rule applies - a user's measurement is `measured`,
      never `published`.

### Then build - **DONE**
- [x] Weapons CRUD, export-all, import-with-preview, and a visible "your data is in this browser
      only" statement that is not buried in a settings page. `lib/userdata` holds the shapes, the
      export file and the merge rules, framework-free; `site/src/lib/rifles.svelte.ts` holds the
      IndexedDB backend and the fallback; `site/src/routes/Rifles.svelte` is the page. The
      not-durable case is the default test path, because node has no IndexedDB.

---

## Phase B - Optics: what to dial, and what the reticle shows

The largest phase, and the one with the most that can be quietly wrong.

### B.1 The solver, and what it must account for - **decided, see [OPTICS.md](OPTICS.md)**
Researched 2026-09-07. A trajectory is Newton's second law with drag, gravity, and empirical
corrections; what separates a toy from a usable solver is the corrections, roughly in order of how
much they move the bullet:

| effect | needs | notes |
|---|---|---|
| **drag** | G1 or G7 BC, or a custom drag curve | the catalogue already carries `g1bc`/`g7bc`; **G7 fits modern boat-tails far better than G1** |
| **air density** | temperature, pressure, humidity, altitude | usually via density altitude; the single biggest environmental term |
| **wind** | speed and angle | crosswind is the dominant horizontal term |
| **spin drift** | twist rate and direction, from the Miller stability factor computed once at the muzzle | horizontal, one-way, grows with range |
| **aerodynamic jump** | crosswind | **vertical**, and routinely mistaken for a wind-call error |
| **Coriolis** | latitude, and firing azimuth for the **vertical** part | small until it is not; needs the shooter's latitude to mean anything. *Corrected 2026-09-07: this row first said azimuth was needed for the horizontal part. It is the other way round - the horizontal deflection depends on latitude alone, and it is the vertical (Eötvös) term that turns on which way the rifle points.* |
| **inclination** | look angle | the naive cosine rule is wrong enough to matter uphill/downhill; use the improved rule |
| **transonic** | - | flag it rather than pretend the answer is good through it |
| **truing** | observed drops | adjust MV or BC to match reality; **the feature that makes the rest honest** |

- [x] **B.1a Decide the integration and the drag model** before writing a line: point-mass with
      G1/G7, or a custom drag curve. This decides the data the catalogue must carry.
- [x] **B.1b Decide what is refused.** Beyond transonic, without a measured MV, or extrapolating a
      BC the record does not have - say so rather than return a confident number. This project's
      whole posture is that an unsourced figure is worse than an absent one.

### B.2 Scope adjustment - the arithmetic the user actually asked for
"x clicks up from 100 m to 300 m" is the output. The units, verified 2026-09-07:

```
1 MOA   = 1.047 in @ 100 yd  ≈ 2.908 cm @ 100 m      clicks usually 1/4 or 1/8 MOA
1 MRAD  = 3.6   in @ 100 yd  =  10.0  cm @ 100 m     clicks usually 0.1 mrad
1 MRAD  = 3.438 MOA
```

- [x] Come-up table from a zero: drop at range → angle → **clicks, rounded to the turret's actual
      increment**, with the residual error shown. A table that says "7.3 clicks" is useless.
      `lib/optics/comeup.ts`; the residual is a column, in centimetres on the target.
- [x] Keep reticle and turret units matched, and warn loudly when a rifle is configured with a MIL
      reticle and MOA turrets - a real and common mistake. `unitsMatch` in `lib/optics/turret.ts`.
- [x] Scope height over bore, and the near-distance crossing it causes. The solver starts the
      bullet one sight height below the line of sight, so the crossing falls out of it.
- [x] Ranging with the reticle: `distance = target size × 1000 / mils` (metric), and the MOA form.
      Both go through one exact inverse, so they cannot disagree.

### B.3 Reticles - designer and database
A reticle is 2D vector geometry with subtension values, which is exactly what `lib/render2d`
already does for cartridges.

- [x] **FFP vs SFP is not a label, it is arithmetic.** FFP subtensions hold at every magnification.
      **SFP subtensions are correct only at the rated magnification**, and at any other the
      observed value scales by `max magnification / current magnification`. A reticle record
      without a focal plane and a rated magnification is unusable, and an SFP reticle used at the
      wrong power is a silent error in every hold.
- [x] Model a reticle as marks with subtensions + a drawing. `lib/optics/reticleMarks.ts` holds a
      reticle purely in angles; four generic patterns are generated (crosshair, duplex, dot grid,
      hash grid), and a named commercial pattern is its owner's subtensions in user data.
- [x] Overlay a computed trajectory on the reticle: where the holds actually fall - including the
      SFP case, where a 2 mil hold lands on the 1 mil mark at half the rated power. The drawing
      shows that rather than hiding it.

⚠️ **Licensing, revisited 2026-09-07 - see [OPTICS.md](OPTICS.md) §B.3 for the worked version.**
Short form: the maker's *image* is copyrighted, their *subtensions* are facts and are not; the
*name* is a trademark and may be used to identify the product with a disclaimer; the *patent*
covers making optics, not drawing diagrams of them, so it does not reach a reference database.
So: **records hold numbers, the drawing is ours**, marks are named and disclaimed, and a user's
own scope's subtensions are user data. Do not ship the makers' images - not because the fair-use
argument would fail, but because holding numbers means never having to make it.

### B.4 Targets - designer and database
- [x] Published catalogue restricted to BDS and DSB. Twelve BDS records cover the circular
      Z targets used by the supplied 2026 rules. Twelve DSB records use the supplied 01.01.2027
      Sportordnung, with its future effective date shown. See [the source review](TARGET-RULEBOOK-REVIEW.md).
- [x] BDS Z 20 interval scoring uses the white nine-ring boundary, independently of the larger
      black aiming area. DSB musket and ordnance records use the required hole-centre scoring.
- [x] Target database focused on dimensions, sources and saved custom faces. Printing controls,
      paper ruler bars and print-specific SVG sizing were removed in September 2026.
- [x] Separate scoring preview with cartridge selection for published projectile diameter,
      local photo calibration, suggested holes requiring review, editable markers and the existing
      coordinate-based scoring. See [APP-WORKFLOWS.md](APP-WORKFLOWS.md).
- [ ] Next image phase: perspective correction, real-photo validation, overlapping holes and saved
      sessions. Scores remain estimates until match-specific scoring conventions are supported.
- [x] Custom concentric target designer with local records and backup through My data.
- [x] Feed it back into group analysis: score a group against the face it was shot on, by the
      touching-the-line convention (so the calibre is required, not defaulted), with **mean radius
      alongside extreme spread and the shot count always attached**.

---

## Phase C - A cartridge designer - **designed, see [CARTRIDGE-DESIGNER.md](CARTRIDGE-DESIGNER.md)**

`routes/CartridgeDesigner.svelte` provides cartridge entry and editing, with a live drawing
and family-specific fields. `routes/Designer.svelte` provides bullet entry.

- [x] **C.1 Find out what is actually slow** - measured across the metallic records, not guessed,
      and now **computed at build time** rather than by hand. 78 distinct fields exist; **26 are
      shared by the four metallic families**, and the working set is 27 for pistol, 30 rimmed, 45
      belted, **49 rimless**. The friction is a form that shows every field to someone who needs a
      third of them, with no signal about which of the rest are irrelevant to their family rather
      than merely unknown. (These figures correct the hand count first recorded here - see
      [CARTRIDGE-DESIGNER.md](CARTRIDGE-DESIGNER.md) C.1, which states what changed and why.)
- [x] Start from a similar cartridge, rather than an empty form - by key, from the whole
      catalogue.
- [x] Validate live against the geometry that already exists. The designer surfaces
      `lib/shapes2d`'s own refusals rather than inventing a second idea of a valid cartridge, and a
      bullet that cannot be seated is reported *without* refusing to draw the case.
- [x] Draw while typing - calling the geometry directly rather than through `lib/live`, which
      caches by key and is wrong for a record that exists only in memory.
- [x] Derive what can be derived and mark it derived: case capacity from the interior profile,
      bore area by the sheets' own formula. Each figure that cannot be computed names the input it
      wanted.
- ~~Import a CIP TDCC sheet's numbers, and keep the sheet URL as the source.~~ **Dropped
      2026-09-07:** a cartridge with a sheet belongs in the dataset as a published record, not as a
      user's hand-entered copy of one. The draft keeps a `source` field for citing where a user's
      own figures came from.
- [x] **C.2 Keep the provenance rule at the door**: a designed cartridge is stored as the user's
      own measurement, travels in their export, and says on the page that it is not a catalogue
      record. `StoredCartridge.origin` cannot be `published`.

---

## What other calculators would make sense

Ordered by *value per unit of work given what this project already holds*. The top group is nearly
free, because the geometry and data are already here.

**Already have the inputs - mostly presentation:**
1. ~~**Stability (Miller `Sg`)**~~ **built.** `lib/ballistics/stability.ts`, with the velocity and
   air corrections; the trajectory page shows it and flags the marginal-twist case. It is also
   what spin drift and aerodynamic jump are computed from.
2. **Case capacity and load density** - `lib/measure2d/interior.ts` already computes the powder
   space; fill ratio is the number reloaders actually use.
3. **Seating depth, jump to lands, COAL** - `fit.ts` already has `jumpToLands` and clearances.
4. **Bore area / rifling** - the validated `Aeff` formula.
5. **Unit converter** - trivial, and constantly wanted.

**Small additions with real value:**
6. **Recoil** - free recoil energy and velocity from rifle mass, charge, bullet mass, muzzle
   velocity. Cheap, and it is what people compare rifles by.
7. **Energy and momentum at range.** Energy is built - it is a column of the come-up table.
   Momentum is not, and is a line of arithmetic away.
8. ~~**Point-blank range / maximum PBR** - "what is my one zero for this rifle".~~ **Built
   2026-09-07 as `lib/ballistics/pointBlank.ts`, under the name its users actually use: GEE,
   die günstigste Einschießentfernung.** Raised by a request on a German forum; the convention
   there is a ±4 cm band, so that is the documented default and not a hard-coded constant.
   Reported with the far edge (the GEE itself), the near edge, the apex, and - the number a
   hunter can act on - how high to set the group at 100 m.

   Building it settled a question worth recording. German hunters are taught to sight in "about
   4 cm high at 100 m" and told it is a rough approximation. Across .243 Win, 7×64, .308 Win,
   .30-06, 8×57 IS and 9.3×62 the optimum zero puts the strike at **3.9-4.0 cm** at 100 m, every
   time. It is not luck: with a 4 cm band and a scope ~5 cm over the bore, the apex of the optimum
   trajectory lands near 100 m for that whole class, so the rule and the construction are nearly
   the same instruction. The tests pin both the agreement and its boundary - a .22 LR tops out
   before 70 m and the rule does not apply to it.
9. **Danger space and max ordinate** - the same trajectory, read differently.
10. **Powder charge ↔ volume** - `lib/data/powders.ts` has the densities.
11. **Reticle ranging** - the arithmetic is built (`rangeFromReticle`, with the SFP correction);
    what is missing is a page of its own rather than a function.

**The statistically honest ones, which almost nothing does well:**
12. **Chronograph statistics** - mean, SD, ES **with the sample size stated**. Extreme spread of
    five shots is nearly meaningless and is quoted constantly; showing a confidence interval on SD
    would be a genuinely useful correction to common practice.
13. ~~**Group statistics**~~ **built.** `lib/targets/score.ts` and the targets page: mean radius
    beside extreme spread, both about the group's own centre, with the shot count always attached
    and a note saying why ES is the weaker number. **CEP and the growth of group size with shot
    count are still missing** - those are the parts that would make it genuinely better than what
    is out there.
14. **Load development** - ladder and OCW planning, and the statistics of whether an observed
    "node" is distinguishable from noise. **This is where an honest tool differs most from the
    others**, and it fits this project's posture exactly.

**Interior-ballistics preview work:**
15. **Pressure and velocity prediction** - the solver is built (`lib/interior`: Noble-Abel gas,
    Vieille's law, the energy balance, a pluggable form function) and every result carries the
    caveat that a computed pressure is not a pressure test. **It is not on the site**, and it
    should not go there until the per-powder form functions are measured; the model currently
    carries a per-powder offset of up to 12 %. Barrel-time / OBT and charge-vs-pressure curves are
    not built.

---

## What other features would make sense

1. **Offline PWA.** It is already a static site; making it installable and offline-capable is
   small and directly useful at a range with no signal. Probably the best effort-to-value item.
2. **Printable DOPE / range card** per rifle and load - come-ups, wind holds, at true scale on a
   card. Separate from the target database.
3. **Load log** tying a load to its groups, its chronograph session and the conditions. This is
   what turns the calculators into a record, and it is what reloaders actually keep.
4. **Side-by-side comparison** of cartridges, loads or rifles. The dataset supports it now.
5. **Chronograph import** - Garmin Xero, LabRadar, MagnetoSpeed. Asked for 2026-09-07 as a
   **standalone, independent converter** rather than only an import path: a small library that
   reads the formats and writes ours, usable without the app. A converter with no UI can be
   tested against real files exhaustively, and a shooter with a drawer full of one vendor's files
   should not have to adopt an app to read them.
   Get real files before writing any parser - a format guessed at from documentation is a format
   that fails on the first export.
6. **Component inventory** - powder, primers, brass on hand, with lot numbers. Lot matters, and
   the powder records already carry `lotid`.
7. **Provenance surfaced in the UI** - where a figure came from, and how confident it is. The
   dataset already tracks it and the site under-shows it; this is a differentiator, not a chore.
8. **Deep links and shareable configurations** - a URL that reproduces a comparison or a solve.
   No backend needed.

### Deliberately not recommended
- **Anything that reads as load advice.** Predicting a charge is not the same as a pressure-tested
  load, and the gap is a safety one. Publish comparisons and predictions, cite sources, and never
  a "recommended charge".
- **Accounts and cloud sync**, until someone decides to run a server. See the constraint at the
  top.
- **Shipping manufacturer load data or commercial reticle patterns.** Verify against them, cite
  them, do not redistribute them.
