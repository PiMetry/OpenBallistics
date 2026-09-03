# CIP TDCC

Cartridge and chamber dimensions from the **C.I.P. Tables of Dimensions of Cartridges and Chambers**
(TDCC), as JSON. 540 cartridges, one file each, foldered by case family.

```
rimless/308_win.json      rimmed/303_british.json     belted/375_h_h_mag.json
pistol/9_mm_luger.json    rimfire/22_long_rifle.json  shotshell/12.json
```

Read one file, one family, or the lot:

```js
import cip from "cartridges";                    // every cartridge, keyed by key
import { pistol } from "cartridges";             // one family
import win308 from "cartridges/rimless/308_win.json";   // one cartridge

cip["308_win"].cartridge.lengths.L3;   // 51.18  case length, mm
pistol["9_mm_luger"].cartridge.caseHead.R1;
win308.chamber.grooves.u;              //   305  twist: one turn in 305 mm
```

Each family directory has an `index.js` importing its own records, and the root `index.js` imports
the families — so a bundler pulls in exactly what is reached. Those are the only files here that
are not records: they hold no data of their own, only imports, so they cannot go stale against it.

Node's ESM loader wants an import attribute on JSON (`with { type: "json" }`); bundlers do not.
The generated modules use the plain form, which is what Vite, webpack and Rollup take.

A record is `key`, `name`, `family`, `cartridge`, `chamber`, and `annotations`, which is not
CIP's and says so by its name: the consumer category, the primer size, and the projectile this
dataset's renderer draws for the record. Take `cartridge` and `chamber` and you have the
standard. `cartridge` and
`chamber` carry the names the TDCC uses (`L1`, `L3`, `P1`, `H2`, `R1`, `G1`, `alpha`, `beta`),
unrenamed, unrounded and unreordered.

## Units and conventions

Millimetres, degrees, bar and mm². Angles given in degrees, minutes and seconds keep that form:
`{"degrees": 1, "minutes": 45, "seconds": 0}`.

A cartridge's dimensions are **maxima** and a chamber's are **minima**: the largest permitted round
and the smallest permitted chamber. The two deliberately share tolerance at the surface the round
headspaces on, so a cartridge dimension exceeding its chamber counterpart is not an error.

- **`projectile.L3PlusG` is a chamber datum, not a seated length.** `G` is the free-bore length
  under `chamber.rifling`, and `L3 + G` exceeds the whole cartridge on several records.
- **`grooves.u` is the twist**: the axial distance for one full turn, in millimetres. `rifling.i` is
  *not* — it belongs to the commencement of rifling.

A field that is absent is one the standard leaves blank for that cartridge. Nothing is filled with a
guess.

## Families

| Family | Records |
|---|---|
| `belted` | 40 |
| `pistol` | 95 |
| `rimfire` | 29 |
| `rimless` | 213 |
| `rimmed` | 146 |
| `shotshell` | 17 |

## Attribution

These are the dimensions standardised by the **Commission Internationale Permanente pour l'Épreuve
des Armes à Feu Portatives (C.I.P.)** and published in the TDCC. C.I.P. is the authority for them;
this repository is an independent, machine-readable rendering for software use.

Not an official C.I.P. publication, and no endorsement is implied. Check your intended use against
C.I.P.'s own terms before redistributing.
