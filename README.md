# OpenBallistics

OpenBallistics is an open database of cartridges, bullets, targets and more. The website lets you browse dimensions and drawings, keep your own records, and explore tools under Preview.

Cartridge, bullet and target records are stored as JSON. The target catalogue currently covers BDS and DSB targets.

## Project structure

- `data/cartridges/`: cartridge records, grouped into `belted/`, `pistol/`, `rimfire/`, `rimless/`, `rimmed/` and `shotshell/`.
- `data/bullets/`: 75 clearly marked synthetic bullet samples for 25 common calibers.
- `data/targets/`: target records.
- `fixtures/`: reference data used by the tests - the half-profiles in `fixtures/profiles/` and the SVG drawings in `fixtures/rendering/`.
- `lib/`: shared libraries for data, drawings and calculations.
- `site/`: the Svelte website.

## Run locally

Install Node.js, then run:

```sh
cd site
npm ci
npm run dev
```

Use `npm test` to run the tests and `npm run build` to build the website.

## Sources and licence

OpenBallistics is an independent project and is not affiliated with C.I.P., BDS or DSB.

The project is available under the [MIT licence](LICENSE). See [third-party notices](THIRD-PARTY.md) for included resources.
