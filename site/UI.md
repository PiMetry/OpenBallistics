# UI conventions

The site uses **shadcn-svelte**, the Vega preset, Tailwind CSS 4 and Bits UI. The source components live in `src/lib/components/ui`, with registry configuration in `components.json`.

## Components and composition

Use the shadcn Button, Input, NativeSelect, Textarea, Label, Card, Badge, Tabs, Separator and Sheet components. `src/components/ui/Panel`, `FormSection` and `Button` compose these components for existing page APIs. They do not implement a second visual system.

- `SiteNavigation` provides the desktop sidebar and the mobile Sheet with focus management.
- `PageHeader` provides the title, description, optional back link and primary action.
- `SearchPanel` aligns search and filters in a Card; `ResultsSummary` aligns view controls with counts.
- `QuantityInput` keeps the label above a numeric input and a fixed-width unit selector.
- My data uses Tabs for settings and saved records. The cartridge designer uses Tabs for cartridge and chamber fields.
- Drawing overlays, image markers and technical tables retain content-specific markup and interaction geometry.

## Theme and layout

`shadcn.css` owns the component theme, Inter font and Tailwind layers. Dark mode follows the existing `data-theme` attribute. `app.css` maps drawing and older page tokens to the same palette. The legacy accent token has been renamed to `--link` to avoid conflicting with shadcn's accent background.

The CSS layer order is `theme`, `base`, `legacy`, `components`, `utilities`. Page-specific rules are below component utilities so old control styles cannot replace shadcn defaults. Rules that reach child components are scoped with a `data-ui` container. Avoid generic layout class names such as `grid` in page CSS, since those names belong to Tailwind.

The desktop sidebar is 15rem wide; it becomes a mobile menu below 64rem. Page content uses shared responsive gutters and an 80rem maximum width within the available workspace. Cards use consistent content padding. Forms group related fields, use aligned columns and stack on narrow screens. Controls default to 40px height; special compact drawing markers retain their own dimensions.

Keep labels associated with inputs and preserve button types, value bindings, unit conversion, disabled states and keyboard focus when composing controls. Use utilities for intentional component overrides rather than adding competing global element styles.

## Maintenance

Add components using the configured registry, for example `npx shadcn-svelte@1.6.1 add <component>`. Review generated changes before replacing customized files. Local customizations include 40px controls, label layout, a full-width phrasing-element wrapper for NativeSelect, button link styling, and theme contrast.

See `AUDIT.md` for browser coverage and validation. The existing hash-route SEO limitation remains a separate routing concern.


## Diagram frames and scale

Use distinct names for layout frames (`diagram-panel`, `plate-viewport`) and drawing contents (`drawing-ink`). Never target a generic `.plate` or `.drawing` descendant to style a frame: generated SVGs and child components can carry the same names. Rotate the ink wrapper as a whole and keep oversized content reachable through the viewport.

Place `ScaleRuler` immediately after the element containing a diagram. Pass its renderer-provided `widthMm`; for SVGs whose viewBox already uses physical units (targets), the default is one unit per millimetre. The component observes the SVG transform and redraws its 1/2/5 scale interval after resizing, zooming, content changes and print layout. Reticles use angular units with the current SFP magnification factor. Photograph rulers appear only after calibration. Keep the ruler outside fixed-size or rotated ink wrappers.
