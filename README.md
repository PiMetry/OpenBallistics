# Open Ballistics

Cartridge and chamber dimensions from the **C.I.P. Tables of Dimensions of Cartridges and Chambers**
(TDCC), as JSON. 540 cartridges, one file each, foldered by case family.

## Drawings

`svg/<family>/<key>.svg` is the cartridge's drawing, rendered upstream and vendored here. Each one
carries its extent in millimetres on its root element, which is how the site lays several out at
one scale and prints them life size.

A cartridge is more than one drawing, along three axes, and `svg/<family>/<key>/` - a directory
beside that file - holds the rest:

| Axis        | Values                  | Default when unsaid |
| ----------- | ----------------------- | ------------------- |
| **subject** | `cartridge`, `chamber`  | `cartridge`         |
| **style**   | `visual`, `technical`   | `visual`            |
| **length**  | a published hull marking | matched by width   |

Which is which is read off the path: every directory name and every `_`- or `-`-separated word of
the file name is a token, and `chamber`, `cartridge`, `technical` (or `tech`) and `visual` name an
axis. Whatever is left over names the length. So all three of these say the same thing, and an
export is not held to a shape it was written before anyone wrote this down:

```
svg/shotshell/12/technical/12_70.svg
svg/shotshell/12/12_70_technical.svg
svg/shotshell/12/chamber/technical/12_70.svg   (a chamber, likewise)
```

**Lengths.** A shot cartridge is published at several hull lengths - a 12 gauge at nine, from
12/35 to 12/89 - and one drawing can only be at one of them. Name a file after the marking
(`12_70.svg`, or just `70.svg`) and it is taken at its word. A *visual drawing of the cartridge*
that names no length is matched instead by the width it states, since the renderer draws the hull
plus a small constant margin; that is what lets `<key>.svg` take its place among the lengths
without being renamed. Technical drawings and chambers are as wide as their dimension lines and
their barrels, so those name their length or they are reported and left out.

All of it is optional. Absent the directory a cartridge shows its one drawing as it always did, and
a toggle appears on the page only for an axis that has actually been drawn. A length or a kind that
has not been drawn says so on the page rather than borrowing another one's picture, and the build
reports any drawing it cannot place - or any directory naming no record at all.

**Orientation.** Draw them lying down, along their axis, as every drawing here already is. That is
what the screen wants: the page is a wide column, a cartridge is three to five times longer than it
is wide, and a dimensioned drawing hangs its length chain - L1 to L6 - along the same axis.

Paper wants the opposite, and the print rules turn them a quarter turn to get it. A4 portrait is
180 mm across and 267 mm down; a cartridge printed lengthways is one thin band on a tall empty
sheet, while the same cartridge stood on end, beside the chamber it is fired in, uses the height
the sheet actually has and lets the pair be read against each other the way the two tables below
them are. So the print sheet shows every subject the cartridge has, upright and side by side,
sized in real millimetres and capped so that a long one shrinks in proportion rather than running
off the page.

## Verification

Nothing here is verified by being published. Five separate things can be confirmed against the
source, by five different readings:

| Facet              | Where it lives                        |
| ------------------ | ------------------------------------- |
| Cartridge numbers  | `annotations.confidence`              |
| Chamber numbers    | `annotations.verified.chamber`        |
| Cartridge drawing  | `annotations.verified.cartridgeDrawing` |
| Chamber drawing    | `annotations.verified.chamberDrawing` |
| Bullet nose form   | `annotations.defaultBullet.verified`  |

The first and the last already had a home and keep it - `confidence` is a word rather than a flag
because it also carries `implausible` - so `annotations.verified` holds only the three that had
nowhere to live. Restating either of the other two there would be a second copy of a fact able to
disagree with the first.

Absent means unverified. A facet that cannot apply to a record - a bullet on a record that
dimensions none, a chamber drawing nobody has rendered - is left out of the site's reckoning
entirely, so a fully checked shot cartridge does not read as unfinished for ever.

Separately from all five, `annotations.implausible` holds the plausibility findings: a rule the
site itself ran and what it caught. A finding with a `why` is a known exception and costs a record
nothing; one without is the site having positive reason to doubt a figure, which is a different
statement from nobody having read it yet.

## Attribution

These are the dimensions standardised by the **Commission Internationale Permanente pour l'Épreuve
des Armes à Feu Portatives (C.I.P.)** and published in the TDCC. C.I.P. is the authority for them;
this repository is an independent, machine-readable rendering for software use.

Not an official C.I.P. publication, and no endorsement is implied. Check your intended use against
C.I.P.'s own terms before redistributing.
