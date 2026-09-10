# Data layout

All source dataset JSON lives under `data/`:

- `cartridges/<family>/<key>.json`: cartridge records in six family directories.
- `bullets/<key>.json`: bullet records.
- `targets/<id>.json`: BDS and DSB target records.

`data/` holds the dataset and nothing else. Test baselines live under `fixtures/`, which is not
shipped: `fixtures/profiles/<family>/<key>.json` are the fixed reference profiles the geometry is
checked against, and `fixtures/rendering/` the SVG drawings the renderer is checked against.

The original source data move preserved all 1,095 JSON files byte for byte. The current dataset
contains 525 cartridges, 24 targets and the bullet catalogue, with 523 profile fixtures beside it.
Package manifests, lockfiles, TypeScript configuration and ignored generated indexes remain
with their owning tools.

Catalogue filtering belongs to the export process. OpenBallistics indexes and serves every record
in `data/cartridges/`; it has no local exclusion list. The former `scope.json` and its duplicate
filters were removed after confirming that no excluded record remained in the dataset.

All 154 SVG files in `fixtures/rendering/` and all 523 profile fixtures in `fixtures/profiles/`
are active regression baselines. They stay in the repository for tests and are not shipped with
the website.

There is no drawing manifest. The layout extents and the list of available views the search index
carries are measured at build time by rendering each drawing through the same functions the
browser uses; see `site/scripts/drawings.ts`.

The website loads public JSON from `/data/cartridges/<family>/<key>.json`,
`/data/bullets/<key>.json` and `/data/targets/<id>.json`, relative to its deployment base.
Hash-based page routes are unchanged. Raw JSON URLs from the previous layout have moved.
The build keeps profile fixtures and dataset metadata out of the published record endpoints.

`site/scripts/records.mjs` defines the data directories shared by the build scripts and Vite.
The in-app bullet designer exports JSON. Record-creation automation and its issue form are removed.
