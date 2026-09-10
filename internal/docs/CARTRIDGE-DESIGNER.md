# Phase C design: a cartridge designer

Answers the planning gate in [ROADMAP.md](ROADMAP.md) Phase C. Nothing built yet.

---

## Cartridge entry and editing

`routes/CartridgeDesigner.svelte` provides cartridge entry and editing; `routes/Designer.svelte`
provides bullet entry. Both use a live drawing alongside the dimensions being edited.

The shared interaction principles are:

- the drawing is the centre of the screen, not an afterthought;
- it redraws live from the figures as they are typed;
- the geometry that draws it is the same geometry the catalogue is drawn with, so what you see is
  what the record means;
- derived values are computed and shown as derived, never typed.

## C.1 What is actually slow - measured, not guessed

The roadmap forbade starting on a guess.

**Corrected 2026-09-07.** The first version of this section reported these counts from a
measurement made by hand. Building the generator that the form actually reads
(`site/scripts/build-fieldsets.mjs`) did not reproduce them, so the numbers below are the
generator's and the earlier ones are struck. **The finding is unchanged in shape** - which is what
the design rests on - but the figures were wrong and are not quietly corrected.

| | was claimed | measured |
|---|--:|--:|
| distinct cartridge + chamber fields populated | ~~98~~ | **78** |
| shared by all four metallic families | ~~25~~ | **26** |

Working sets, at the same threshold (a field is in a family's set when ≥ 90 % of that family's
records carry it), over the same records the earlier count used:

| family | records | was claimed | measured |
|---|--:|--:|--:|
| pistol | 95 | ~~25~~ | **27** |
| rimmed | 146 | ~~28~~ | **30** |
| belted | 40 | ~~42~~ | **45** |
| rimless | 213 | ~~45~~ | **49** |

The record counts reproduce exactly, so both measurements looked at the same 494 records; the
field counts do not, and no reading of "distinct field" I could construct gives 98 (78 for the four
metallic families, 80 adding rimfire, 86 counting bare field names without their group, 117
including shotshell's repeating rows). The hand count is not reproducible and the script is, so the
script wins.

**Two deliberate differences in what the generator counts**, both of which move the numbers a
little further from the table above:

- It counts every record in `data/cartridges/`. Export filtering removes marking rounds and
  chamber-only duplicates before publication; the site has no local exclusion list. The current
  pistol catalogue contains 86 records, with 29 fields in its working set.
- It **includes rimfire**, which the earlier count left out. Rimfire records genuinely lack many
  chamber fields, so adding them drops the shared core from 26 to 17. That costs nothing: the form
  is family-first, so the shared set is a starting point rather than the thing on screen.

So the friction is not that a cartridge has many dimensions. It is that **a form built from the
schema shows 78 fields to someone entering a pistol cartridge who needs 29** - and gives no signal
about which of the remaining 49 are irrelevant to their family rather than merely unknown. That is
the thing to fix, and it is fixable from the data itself rather than from taste: the sets are
computed at build time and recomputed whenever the dataset grows.

## The design that follows

- **Pick the family first.** It is the one answer that determines the form, and it is the first
  thing a person knows about the cartridge in front of them.
- **Show that family's working set**, with the rest behind a "further dimensions" disclosure that
  says how many and why they are unusual. Never a wall of 98.
- **Distinguish "not applicable" from "not known".** A pistol case has no shoulder; a rimless case
  whose shoulder angle is simply unmeasured is a different state, and the record already
  distinguishes absent fields from numeric zero. Preserve that distinction when editing.
- **Start from a neighbour.** Duplicating a similar cartridge and editing beats an empty form, and
  the catalogue supplies existing records to copy.
- **Draw while typing** - `LiveCartridge` already does exactly this.
- **Validate against the geometry, live.** `ImplausibleDimensionError` and `MissingDimensionError`
  are already thrown by `lib/shapes2d`; surfacing them as you type turns them from a crash into
  guidance.
- **Derive what is derivable and label it.** Case capacity from the interior profile
  (`lib/measure2d/interior.ts`), bore area from the rifling group
  (`Aeff = π/4·F² + N·b·(Z-F)/2`, validated on 486 of 496 records). Never let a derived figure be
  typed over silently.
- ~~**Import a TDCC sheet's numbers and keep the URL** as the source.~~ **Dropped 2026-09-07.** A
  cartridge that has a TDCC sheet belongs in the dataset as a published record; having a user
  re-enter it by hand would produce a second, worse copy of something the catalogue should simply
  carry. The draft keeps a `source` field so a user can say where their own figures came from.

## The rule at the door

A designed cartridge is **the user's**, stored in the Phase A store, marked `measured`/`estimated`,
and shown as theirs. It does not become a dataset record without a sheet behind it - promotion is a
deliberate act with a source, not a consequence of pressing save. This is
[USER-DATA.md](USER-DATA.md) §A.5 applied to the one feature most likely to blur it.

## What implementation then needs

- [x] Compute the per-family field sets from the dataset at build time, so the form follows the
      data rather than a hand-kept list that goes stale. `site/scripts/build-fieldsets.mjs` writes
      `fieldsets.generated.json`, gitignored and rebuilt by `npm run prepare-data` like the record
      index. Building it is what caught the hand-counted figures above.
- [x] The form: family first, working set, disclosure for the rest, not-applicable vs not-known.
      `site/src/routes/CartridgeDesigner.svelte`. Each hidden field shows how rare it is, so
      "hidden" reads as "unusual for this family" rather than as "missing".
- [x] Duplicate-and-edit from any existing cartridge, by key, from the whole catalogue.
- [x] Live drawing and live validation. The drawing calls the geometry directly rather than
      going through `lib/live`, which fetches and caches by key - right for the catalogue, wrong
      for a record that exists only in memory and changes on every keystroke.
- [x] Derived values shown as derived: case capacity from the interior profile, bore area by the
      sheets' own formula. Each one that cannot be computed says which figure it wanted.
- ~~TDCC import with the source URL retained.~~ **Dropped 2026-09-07, by decision.** Not wanted:
      the designer is for a cartridge somebody is entering themselves, and a cartridge that *has*
      a TDCC sheet is one the catalogue should carry as a dataset record rather than one a user
      re-enters by hand. The draft keeps its `source` field so a user can cite where their figures
      came from; nothing parses a sheet, and nothing will.

### Also still open

- ~~**Editing an angle.**~~ Built: three boxes, degrees / minutes / seconds, as the sheets print
  them. Which fields are angles is generated from the dataset (seven of them) rather than guessed
  from the field's name, and minutes and seconds stay optional so a sheet that prints whole degrees
  does not gain two zeroes it never had.
- **Plausibility of the case outline.** The geometry catches *missing* dimensions, not absurd
  ones - a negative case length draws without complaint. `lib/designer/cartridge.test.ts` pins that
  limitation so it stays visible.
- [x] A round-trip test: 48 real records are flattened to drafts, rebuilt and drawn
      point-for-point against the originals, and a designed cartridge goes out through the export
      file and back in. The first version of that test failed on every belted and magnum record,
      because the draft model dropped `annotations` and `primerType` is required to draw a
      centrefire case at all.
