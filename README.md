# Open Ballistics

Cartridge and chamber dimensions from the **C.I.P. Tables of Dimensions of Cartridges and Chambers**
(TDCC), as JSON.

## Verification

Nothing here is verified by being published. Five separate things can be proofread by a person,
and each is recorded on its own. The verdicts are data: they are kept upstream in BallisticViz,
in `data/verifications.json`, merged into each record when the dataset is built, and carried
here in the fields below. There is nothing to vote on and no issue to file; a wrong figure is
reported with the *Something is wrong with this cartridge* form.

| Facet              | Where it lives                        |
| ------------------ | ------------------------------------- |
| Cartridge numbers  | `annotations.confidence`              |
| Chamber numbers    | `annotations.verified.chamber`        |
| Cartridge drawing  | `annotations.verified.cartridgeDrawing` |
| Chamber drawing    | `annotations.verified.chamberDrawing` |
| Bullet nose form   | `annotations.defaultBullet.verified`  |

## Attribution

These are the dimensions standardised by the **Commission Internationale Permanente pour l'Épreuve
des Armes à Feu Portatives (C.I.P.)** and published in the TDCC. C.I.P. is the authority for them;
this repository is an independent, machine-readable rendering for software use.

Not an official C.I.P. publication, and no endorsement is implied. Check your intended use against
C.I.P.'s own terms before redistributing.
