# Phase A design: the user's own rifles, loads and sessions

Answers the planning gate in [ROADMAP.md](ROADMAP.md) Phase A: decisions, with the reasoning, so
that implementation is typing rather than deciding. The framework-free half is **built** -
see *Built so far* below; the store and the UI are not.

---

## A.1 Storage - IndexedDB for records, `localStorage` stays for preferences

**Decision: user *records* go in IndexedDB. UI *preferences* stay in `localStorage`, where they
already are.**

The site already keeps three preferences in `localStorage` - drawing style, theme, language - each
a short string behind a try/catch, because a browser set to block site data throws on first access
rather than returning nothing. That pattern is right for what it does and should not move.

User records are a different shape and outgrow it:

| | `localStorage` | IndexedDB |
|---|---|---|
| capacity | ~5 MB, and it is a hard wall | hundreds of MB |
| a rifle photo | already a problem | fine |
| a chronograph session of 200 shots | possible, clumsy | what it is for |
| querying "loads for this rifle" | read and parse everything | an index |
| schema change after users have data | hand-rolled migration | `onupgradeneeded`, versioned |

The last row is the deciding one. A schema change once someone has data is a migration whether or
not there is a mechanism for it, and IndexedDB has the mechanism.

**Consequences to design for, not discover:**

- IndexedDB is **asynchronous** and the app reads preferences synchronously today. The store is
  loaded once at startup into rune state; components read that, never the database.
- **Storage can be refused or wiped** - private windows, "clear site data", and Safari's eviction
  of unused origins. The same try/catch posture applies, and when it fails the app degrades to
  in-memory for the session and **says so visibly**, because silently losing a user's rifles is
  the worst outcome available here.
- No cross-device sync exists and none is implied anywhere in the UI.

## A.2 Export - the format is the durability story

Because the storage above can vanish with a browser setting, **export is not a convenience
feature**. One button, one file, everything.

```jsonc
{
  "format": "openballistics-user-data",
  "version": 1,                     // integer, monotonic
  "exported": "2026-09-07T14:03:00Z",
  "app": { "name": "OpenBallistics", "commit": "a3a447e" },
  "rifles":   [ /* A.3 */ ],
  "loads":    [ ],
  "sessions": [ ],                  // chronograph and group data
  "settings": { }                   // only what a user would miss
}
```

Rules, so a file written today opens in two years:

- **Keys sorted, pretty-printed.** An export is something people keep in a folder, mail to
  themselves, and occasionally diff. Stable ordering makes a diff mean something.
- **`version` is checked on import.** Older is migrated forward. **Newer is refused with a plain
  message** - never a partial import that silently drops fields it did not understand.
- **Every record carries its own id and timestamps**, so a re-import can tell "the same rifle,
  edited" from "a second rifle".
- **The format is the interchange format.** No second "backup" format; if it cannot round-trip
  everything, it is a bug.

## A.3 References - resolve, but keep a snapshot

A rifle names a cartridge. The catalogue is a living dataset: keys get renamed, records get
retired, dimensions get corrected against a re-read sheet.

**Decision: store the reference *and* a minimal snapshot, and prefer the reference.**

```jsonc
{
  "id": "rfl_01H…",
  "name": "5\" KW 9 mm",
  "cartridge": {
    "key": "9_mm_luger",            // resolved against the catalogue first
    "snapshot": {                   // what was true when the rifle was saved
      "name": "9 mm Luger",
      "family": "pistol",
      "capturedAt": "2026-09-07",
      "fields": { "caseLength": 19.15, "boreArea": 62.61 }
    }
  },
  "barrel": { "lengthMm": 127, "twistMm": 250, "twistHand": "right",
              "landDiaMm": 8.82, "grooveDiaMm": 9.02, "grooves": 6, "grooveWidthMm": 2.49 },
  "scope":  { "clickUnit": "mrad", "clickValue": 0.1, "heightOverBoreMm": 38,
              "zeroDistanceM": 100, "zeroConditions": { } },
  "muzzleVelocity": { "value": 338.6, "unit": "m/s",
                      "source": { "kind": "measured", "date": "2026-09-07" } }
}
```

On load: resolve `key`. If it resolves, use the catalogue and **show it if the snapshot disagrees**
- that is a correction the user should see, not one to hide. If it does not resolve, fall back to
the snapshot and label it *"this cartridge is no longer in the catalogue; showing your saved
copy"*. Never silently substitute a similarly-named record.

Snapshot only what a solver or a drawing needs. It is a safety net, not a copy of the dataset.

## A.4 Import - real files before parsers

- **Chronograph CSVs** - Garmin Xero, LabRadar, MagnetoSpeed. **Get real exports from each before
  writing anything**: the formats differ between devices and between firmware versions on the same
  device, and a parser written from a forum post is a parser that works on one file.
- **Every import previews**: what will be added, what updated, what skipped and why. An import that
  silently overwrites a rifle is the same failure as losing one.

## A.5 Provenance - a user's figure never becomes the dataset's

The dataset already carries `annotations.confidence` (`verified` / `unverified` / `implausible`)
and marks derived values as such. User data joins that discipline rather than inventing one:

- Every user-entered figure carries `source: { kind, by, date, note }` with **`kind` one of
  `measured`, `estimated`, `imported`** - and **never `published`**, which is reserved for a figure
  with a document behind it (`docs/BULLETS.md`).
- **User records live in their own store and are never written into `cartridges/`.** A designed
  cartridge or a measured bullet is the user's until a sheet exists for it; promotion is a separate
  deliberate act with a source, not a side effect of saving.
- Anything computed from user input is labelled derived and recomputed, never stored as if typed.

---

## Built so far

`lib/userdata` - the framework-free half: the shapes (A.3), the export format (A.2) and the import
preview (A.4), with **12 tests**. The round trip the section below called for exists now rather
than after the first user has data.

The split is the one the boundaries already enforce: the model and the file are a library, and the
IndexedDB adapter is not, because `indexedDB` is a browser API and a library may not assume one.

Three behaviours are pinned by test because each is a way to lose someone's data quietly:

- **a newer export is refused**, not partially read - importing a version this build cannot name
  would drop fields into a file the user believes is their backup;
- **an older rifle never overwrites a newer one** - the failure being guarded is importing last
  month's backup over this month's work;
- **exports are byte-identical for identical data**, keys sorted, so a diff of two exports shows
  changes that are actually changes.

Since then the **store** is built too: `lib/userdata/store.ts` defines the backend as an interface
with an in-memory implementation, and `site/src/lib/rifles.svelte.ts` implements it over IndexedDB
(schema v1, `onupgradeneeded`) and holds the rune state components read.

The refusal path from §A.1 is not a branch. It is the same interface, so the store logic is written
once and the memory backend is what the tests exercise - which makes the degraded path the
best-covered code in the file rather than the least. `durable` carries the difference to the UI.

## What implementation then needs

**Phase A is built** (2026-09-07). `lib/userdata` holds the shapes, the export file and the merge
rules; `site/src/lib/idb.ts` and `records.svelte.ts` hold the browser half; `routes/Rifles.svelte`
is the page. It has since grown three more kinds of record - designed cartridges, reticles and
target faces - all through the same store and the same export.

- [x] Rifles CRUD in the UI against the shape in A.3, calling `save`/`remove`.
- [x] The export and import buttons, wired to `exportAll` and `preview`.
- [x] The "your data is in this browser only" statement, and the stronger one when `durable` is
      false - on the page itself rather than in a settings screen nobody opens.
- [x] Round-trip test: export, wipe, import, and compare. It runs on every kind of record, and
      because node has no IndexedDB it exercises the refused-storage path by default.
- [ ] **Chronograph CSV import**, as a standalone converter library for Garmin Xero, LabRadar
      and MagnetoSpeed, usable without the app and tested against real files.
      Asked for 2026-09-07; see ROADMAP "What other features would make sense" item 5.
      **Get real files first** - a format guessed at from documentation fails on the first export.
