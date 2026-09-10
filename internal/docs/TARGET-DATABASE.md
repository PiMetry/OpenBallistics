# Target database

Published BDS and DSB records live in `data/targets/<id>.json`. The website discovers these files
automatically and serves them in development and production. Keep each filename equal to its
record's `id`, and include the dimensional source and applicable discipline rules.

`lib/targets/bds.ts` and `dsb.ts` retain named library exports backed by those same JSON records.
When introducing a named library export, import its JSON record there too.

The Add target page at `#/targets/new` supports individual ring diameters, card dimensions,
black and white areas, an inner ten, and edge or centre scoring. It shows a live preview,
saves personal targets in the browser, and imports or downloads individual JSON files.
Importing a published file into this editor creates a personal copy of its geometry.

My data backups include personal targets. Their scoring method and optional visual fields
survive backup export and import. Saving from the website does not write into the repository.

The geometry importer rejects malformed dimensions, repeated scores and reversed ring sizes.
Dataset and scoring tests run with `npm test` from `site/`.
