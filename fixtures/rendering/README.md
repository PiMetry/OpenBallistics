# Rendering fixtures

Fixed reference SVGs used by the drawing tests. `samples/` holds 148 cartridge and chamber
drawings; `bullets/` holds six bullet drawings. These files are test data and are not shipped
with the website.

The tests compare SVG structure and numeric values against these fixtures. Keep them independent
of the renderer under test, and review any fixture changes alongside the corresponding drawings.
