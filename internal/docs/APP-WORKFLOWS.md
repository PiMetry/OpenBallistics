# Database and preview workflows

Implementation plan and progress, 2026-09-08.

The database reorganization, gun units, BDS catalogue and first image-scoring preview are implemented.

## Database navigation

- Keep Cartridges, Bullets, Guns and Targets in the main navigation.
- Open the bullet and cartridge designers from their database pages.
- Put trajectory and the existing seating/charge component under Preview. Keep existing deep links working.
- Provide an open calculator ToDo page listing the components and the integration/verification work still needed.

## Guns

- Use generic gun names and an optional gun type; preserve existing records and the v1 backup format.
- Keep canonical stored values in mm, m and m/s. Convert only at the input/display boundary.
- Support metric/imperial defaults and independent unit choices for every dimensional field.
- Display twist as one turn per distance (`1:8 in`, equivalent to `1:203.2 mm`). Angle units remain MOA/MRAD, with conversion when switched.

## Targets

- Remove printing controls, print guidance and calibration bars for paper output.
- Add circular BDS faces from the official Sporthandbuch, Zielscheiben, revision 2025-06-30.
- Select a cartridge to obtain the published projectile diameter for hole scoring. Do not substitute a shotgun bore or an absent diameter.
- Keep the target catalogue as records and references. Open scoring as a separate workflow from a target.

## Image scoring phase

- Local image upload; no image leaves the browser.
- Calibrate a front-on photograph against the chosen target's centre and a known scoring ring.
- Suggest isolated holes from local image contrast and the selected cartridge diameter. Show suggestions separately until reviewed.
- Add, move and remove markers manually; use the existing scoring functions for accepted markers and draw the same coordinates on the target.
- Keep manual coordinate entry as an alternative.
- Follow-up phase: real-photo validation corpus, perspective rectification, overlapping-hole detection and saved image-scoring sessions. The first preview must state these limits.

## Verification

- Unit conversion round trips, optional/invalid values and switching units without editing data.
- BDS dimensions and ring colors; shared scoring boundary cases.
- Image calibration, synthetic hole detection and manual-marker scoring.
- Browser checks for navigation, persistence, unit controls, local image upload and mobile layout.
- Full test suite and production build, run sequentially because both regenerate catalogue files.

## Compatibility and preview limits

- `#/guns` is canonical; `#/rifles` continues to open existing records. The record type is `Gun`,
  and the IndexedDB / backup collection remains `rifles`, so no destructive migration is required.
- `#/preview/trajectory` is canonical; `#/trajectory` still works. Existing calculator components
  were relocated without changing their numerical models.
- BDS sources: [official Zielscheiben handbook](https://www.bdsnet.de/ressourcen/downloads/2025_06_30_shb_z_2025-klein.pdf),
  revision 30.06.2025. Included: Z 1, 2, 3, 4, 5, 7, 8, 9, 18, 19, 20 and 21. The diagram preserves white centres
  and black annuli. This is a target-dimension catalogue, not complete BDS match adjudication.
- Photo scoring estimates integer ring values using the published G1 diameter. It does not apply
  special scoring gauges, discipline penalties or decimal scoring. Shotgun pellets and airgun
  projectiles without cartridge catalogue records are not silently assigned a guessed diameter.
- Photos are decoded locally and reduced to at most 1600 pixels on their longest side. Calibration
  coordinates refer to this preview image. Confirmed marker coordinates are editable in pixels.
  Detection suggests at most 100 isolated contrast features; these need manual review. No photos
  or scoring sessions are saved after leaving the page in this phase.

## Validation completed

- 1,503 tests pass, including legacy gun backups, unit conversions, BDS dimensions, photo
  calibration, isolated hole suggestions and rejection of thin circular rings.
- The production build succeeds. The existing click/keyboard accessibility warning in
  `site/src/routes/Designer.svelte:551` remains; the new components add no warnings.
- Headless Edge checks passed for gun save/reload, the global default, independent angle/length/
  distance units, invalid-input handling, navigation and relocated calculator components.
- A local synthetic target photo was uploaded, calibrated, analysed and reviewed. Suggestions
  were excluded from scores until accepted. Invalid calibration removed the displayed score.
- Guns, Targets, Preview and Trajectory fit 320 px in English and German. The photo workflow
  fits a 390 px viewport. No runtime exceptions were observed during these checks.

## Interface follow-up

Database and creation pages share `PageHeader` and `AddAction`. Creation labels are Add cartridge,
Add bullet, Add gun and Add target. The footer report link is present on every route and includes
its current URL, heading and selected public catalogue context. Cartridge details no longer link
to calculator components. [Interface conventions](INTERFACE-STYLE.md) record the ASCII punctuation
preference. [Target rulebook review](TARGET-RULEBOOK-REVIEW.md) records the checked editions and limits.

The follow-up browser checks covered all 13 routes at 320 px, the four shared add actions,
selected target context in footer reports, DSB centre-scoring labels and the removal of calculator
links from cartridge details. The target diagram and specification now share a two-column desktop
layout and stack on small screens. Published inner-ten rings are also drawn.

## Target creation and interface cleanup

The 24 BDS and DSB targets now live in root-level JSON files. Add target opens a dedicated page
with editable ring diameters, a preview, browser storage and individual JSON import/export.
See [Target database](TARGET-DATABASE.md) for the record and storage layout.

The interface no longer shows plausibility filters, badges, finding panels or verification
messaging. The README is a short project overview. Single-line fields and the catalogue size
selector share the same control height. Browser checks covered local save/reload, JSON round
trips, invalid imports, backups, footer context, both editor languages and 320 px layouts.

## Global settings

My data contains the global unit system, the separate barrel length and twist unit default,
language and appearance. Barrel measurements default to inches independently of the general
unit system, and use the same preference in gun editors and summaries. Fields still allow
individual unit changes. Settings persist in this browser and remain outside record backups.

Browser checks covered conversion between 20 in and 508 mm, twist conversion between 1:8 in
and 1:203.2 mm, unchanged stored dimensions after resaving, preference persistence and German
Zoll labels at 320 px.
