# Phase B design: the solver, the turret, the reticle and the target

Answers the planning gate in [ROADMAP.md](ROADMAP.md) Phase B. Researched 2026-09-07. Nothing here
is built yet.

---

## B.1a Drag model and integrator - decided

**Decision: numerical point-mass integration, with drag as a function of Mach number supplied by a
pluggable model. Ship G1 and G7 standard tables scaled by ballistic coefficient; design the
interface so a per-bullet custom drag curve can replace them without touching the solver.**

### Why numerical rather than closed-form
Pejsa's method fits an analytic velocity-decay curve and is elegant, but it is a fit to supersonic
decay and its usefulness falls away exactly where trajectories get interesting. Numerical
integration of the point-mass equations - drag along the velocity vector, gravity, and the
empirical corrections - is what mainstream solvers do, is no harder to write, and extends to
custom drag data without a rewrite.

### Why G7 matters, and why the interface matters more
Each real bullet is mapped onto a reference shape by a scalar. **G1's reference is a blunt,
flat-base 19th-century shape; G7's is a long boat-tail** like a modern match bullet. Consequently
a **G7 BC stays far more constant across the velocity range** for such bullets, while a G1 BC for
the same bullet drifts and effectively needs banding.

So:

- Use **G7 where the record has one and the bullet is a boat-tail**; G1 for flat-base and blunt
  shapes, where G1 *is* the closer reference.
- Never convert one to the other. A G1↔G7 "conversion" is a fit at one velocity and is wrong
  elsewhere, which is precisely the kind of invented figure this project refuses.
- **Custom drag models (a measured Cd-vs-Mach curve per bullet) are the accurate answer**, and
  their advantage is largest near transonic. We have no such data and are not going to invent it -
  but the solver takes `drag(mach) -> Cd`, so the day a curve exists it drops in.

### The integrator
Fixed-step RK4 over time, with the step chosen by a **convergence test rather than by feel**:
halve the step and the answer must not move by more than the displayed precision. That test lives
in the suite, so a future change to the step is caught rather than argued about.

### What we actually have to feed it
The site's own bullet catalogue has six records. Broader coverage requires additional bullet
records with documented sources and ballistic coefficients.

## B.1b What the solver refuses to answer

The project's posture is that an unsourced figure is worse than an absent one. In a solver that
means refusing, not guessing:

| condition | behaviour |
|---|---|
| no ballistic coefficient for the bullet | **refuse.** Do not infer one from shape or calibre |
| no measured muzzle velocity | compute, but label the whole result *estimated from a nominal MV*, everywhere it is shown |
| below ~Mach 1.2 | **flag the range band.** A BC-scaled standard curve is least trustworthy through transonic, which is exactly where people want an answer |
| Coriolis without a latitude | omit the term and say so. Never assume a latitude |
| a G1 BC where only G7 fits, or vice versa | use what the record has and name which model produced the number |
| inclined fire | use the improved rule, not the bare cosine, and show the look angle used |

Every output carries the model and the inputs that produced it. A come-up table with no atmosphere
attached is a number without a claim.

## B.2 The solver's contract

**In:** rifle (from Phase A: barrel, twist and hand, scope click unit/value, sight height, zero),
bullet (mass, diameter, BC + model, length for stability), load (muzzle velocity + how it was
obtained), atmosphere (temperature, pressure, humidity, altitude), wind (speed, angle), shot
(distance, look angle, latitude and azimuth if Coriolis is wanted).

**Out, per range step:** time of flight, velocity, Mach, energy, drop (cm and angular), wind
deflection, spin drift, aerodynamic jump, total elevation and windage **as clicks rounded to the
turret's real increment plus the residual**, and a flag for the transonic band.

Units: metric primary, imperial available; the conversions are exact and belong in `lib/core`.

```
1 MOA  = 1.047 in @ 100 yd ≈ 2.908 cm @ 100 m     clicks 1/4 or 1/8 MOA
1 MRAD = 3.6   in @ 100 yd =  10.0  cm @ 100 m    clicks 0.1 mrad
1 MRAD = 3.438 MOA
```

## B.3 Reticle model

```jsonc
{
  "id": "ret_…",
  "name": "Mil grid 0.2",
  "focalPlane": "FFP",              // or "SFP"
  "ratedMagnification": 25,         // REQUIRED for SFP; meaningless for FFP
  "unit": "mrad",                   // subtensions are in this and nothing else
  "marks": [ /* geometry: lines, dots, numbers, each with its subtension */ ]
}
```

- **SFP is arithmetic, not a label.** Subtensions hold only at `ratedMagnification`; at any other
  power an observed value scales by `ratedMagnification / currentMagnification`. A reticle record
  without both fields cannot be used, and an SFP reticle read at the wrong power is a silent error
  in every hold and every ranging.
- The marks are 2D vector geometry - the same thing `lib/render2d` already draws - so a reticle can
  be rendered, printed at true scale, and have a computed trajectory overlaid on it.

### What may and may not go in a reticle database

Revisited 2026-09-07. The first version of this note said "patterns are trademarked and some are
patented" and left it there, which conflated three separate regimes and got the scary one
backwards. Separating them changes what the database should hold.

**Copyright covers the manufacturer's image, not the geometry.** Their promotional PNG or vector
file is their expression and copying it is a copyright question we would have to argue. The
*subtensions* are not: a table of measured angles is fact, and facts carry no copyright at all
(Feist v. Rural). So a record built from published subtension figures and drawn by our own
renderer raises no copyright question to answer - it is not a fair-use defence, which is a
case-by-case argument, it is that there is nothing to defend.

That is why **records hold numbers and the drawing is generated**, and it is why shipping a
low-resolution thumbnail of the maker's own image - sometimes suggested as a way to strengthen a
fair-use position - would make things worse here, not better. It starts an argument we currently
do not have to have, and a thumbnail is useless to a solver anyway.

**Trademark covers the name, and naming is allowed.** "EBR-7C" or "TREMOR3" identifies a product;
using a mark to refer to the thing it names is nominative use. What it requires is that we not
imply endorsement: no maker's logo, no house styling, and a plain statement that marks belong to
their owners and this project is not affiliated with or endorsed by them.

**Patent is the one the earlier note had backwards.** A patent is infringed by making, using,
selling or importing the invention. A reticle patent covers the *optic*; drawing a diagram of one
in a reference database is none of those acts, so the depiction risk is essentially nil - and
there is no fair-use defence in patent law, so it is worth knowing that the exposure is absent
rather than merely arguable. It would matter to somebody manufacturing reticles. It does not
matter to us.

**What actually constrains us is accuracy, not law.** A wrong subtension published under a
manufacturer's name is a bad hold on a live target, which is a worse outcome than any of the
above. So the dataset rule is the project's usual one: a subtension carries the sheet it came
from, a figure we could not source is absent rather than estimated, and a subtension a user typed
in from their own scope is theirs and stays marked as theirs.

**In practice, then:** ship generic patterns and a designer; render every reticle from its own
numbers; cite the maker's spec sheet per figure; name marks and disclaim affiliation; and provide
a plain route for a manufacturer to ask for something to be removed. A user may record their own
commercial scope's subtensions for their own use, and that record is user data, not a dataset
record.

_Not legal advice; the above is the reasoning the design rests on, not an opinion from counsel._

## B.4 Target model

```jsonc
{
  "id": "tgt_…",
  "name": "ISSF 25 m precision",
  "governingBody": "ISSF",
  "source": { "rulebook": "ISSF Rules", "edition": "…", "url": "…" },
  "faceMm": { "width": 500, "height": 500 },
  "rings": [ { "score": 10, "diameterMm": 50 }, … ]
}
```

- Every face **cites the rulebook and edition it was read from**, per figure, exactly as the CIP
  sheets are cited. Governing bodies revise dimensions; an uncited target face is a rumour.
- **Print at true scale** - the most useful thing in this phase, and the renderer already does true
  scale honestly, including the caveat that a display's real pixel density is unknown.
- Bodies worth covering first: **DSB** and ISSF (metric, and the user's own), then NRA, IPSC/USPSA,
  F-Class.
- Feeds group analysis: score a group against the face it was actually shot on.

---

## What implementation then needs

- [x] `lib/ballistics`: `drag(mach) -> Cd` behind an interface, G1 and G7 tables, RK4 integrator,
      the convergence test, and the refusal rules of B.1b as code rather than as documentation.
- [x] Atmosphere: density from temperature, pressure, humidity, altitude. Both reference airs are
      named constants - ICAO and Standard Metro - because a published chart assumes one of them
      and comparing against the wrong one looks exactly like a solver error.
- [x] Secondary effects, each behind its own flag and each labelled in the output. Spin drift and
      aerodynamic jump are separate columns of the come-up table, and each *omission* names the
      input that is missing rather than saying nothing.
- [x] Truing against observed drops - the thing that makes the rest honest. `lib/ballistics/truing.ts`:
      velocity against a mid-range observation, coefficient against a long one, **and the pair
      iterated**, because one pass each leaves the velocity carrying part of the coefficient's
      error (measured: 786 m/s recovered where the truth is 792). Refuses to fit a coefficient to
      a transonic observation, and flags a fit that has to move an input further than that input
      is ever wrong by.
- [x] `lib/optics`: click arithmetic, come-up tables, reticle ranging, SFP scaling.
- [x] The reticle and target *models* and their drawings: `lib/optics/reticleMarks.ts` and
      `reticleDrawing.ts` (angles in, SVG out, holds laid on the glass, SFP scaling enforced);
      `lib/targets` (six ISSF faces transcribed from the rulebook with their rule numbers,
      scoring by the touching-the-line convention, group statistics, and a true-scale printable
      SVG in millimetre units). Still open: saving a user's own reticle and target *into* the
      Phase A store, and a designer UI for each.
- [x] **Validation before release**: `lib/ballistics/validation.test.ts` holds the solver against
      Federal's published table for GM308M2 (175 gr SMK, G1 0.505, 2600 fps, stated conditions).
      Agreement is within **0.1 % on velocity at every range out to 500 yd** and within 1 inch on
      10 mph wind drift - under Standard Metro. Under ICAO the same solve is 0.6 % slow at 500 yd,
      which is the disagreement being stated: it is the reference air, not the solver.

### Still open in Phase B

- ~~**Coriolis**~~ **built 2026-09-07.** Integrated as `-2 Ω × v` rather than fitted, since the
  integrator was already there. Latitude is required or the term is omitted and said to be;
  azimuth is optional, and without it the vertical (Eötvös) part is dropped and named, because
  whether a shot is lifted or dropped cannot be known without knowing which way the rifle points.
  Every solve now carries an `omitted` list for exactly this.
- ~~**Saving a reticle or a target face as user data.**~~ **Built 2026-09-07.** Both are records in
  the Phase A store (IndexedDB, schema v3) and both travel in the export. A user names a reticle
  and keeps it; a user draws a face - concentric, evenly spaced, four numbers - and keeps that.
  `StoredTargetFace` has no `source` field at all, so a face a user drew can never appear to cite a
  rulebook. Per-page settings (chosen pattern, chosen face, GEE tolerance) are `localStorage`
  preferences instead, which is the other half of A.1's split.
- **More faces**: IPSC/USPSA and F-Class. Both are a different shape of problem - their faces are
  scoring *zones* (A/C/D, or a rectangle with a scoring area) rather than concentric rings, and
  `TargetFace` has no way to express one. That is a model change, not a transcription, and it
  should be designed rather than bolted on. ISSF, DSB and NRA are done: twenty faces, each cited
  to its rule.
- Three bodies now publish the ISSF 50 m rifle face and all three transcriptions agree ring for
  ring; five ISSF faces have a second source. That is worth more than the extra faces themselves.
- The DSB **running-target** faces are still missing on purpose: the summary table gives their card
  as "150 × 260" and "1320 × 760" and which figure is the width cannot be told from it. A face with
  a transposed card is worse than a missing one; the per-face pages would settle it.

Everything else in this document is built and reachable from the site: the solver, truing, the
come-up table, the GEE, the reticle overlay and the printable faces.
