# Site review — 8 September 2026

This review covers accessibility, SEO, responsive layouts and consistency in the Svelte site. It builds on the existing local changes and leaves the reference data and calculation models unchanged.

## Current implementation: shadcn-svelte

The site now uses the official shadcn-svelte Vega components with Tailwind CSS 4, Bits UI and locally hosted Inter. The earlier custom-component-only approach below has been superseded. `components.json` configures the registry; `src/lib/components/ui` contains the component source. `UI.md` describes the theme, CSS layers and local customizations.

- Desktop navigation is a sidebar; mobile navigation is a Sheet with a focus trap, Escape handling and focus restoration.
- Buttons, inputs, selects, labels and textareas across the site use shadcn components. Shared panels and form sections compose Card and Field components. Catalogue cards and preview tool cards use Card and Badge.
- My data uses settings/records tabs and aligned settings rows. The cartridge editor separates cartridge/chamber fields with tabs. Gun details and measurements occupy separate aligned cards. Unit inputs have fixed-width selectors beside flexible numeric fields.
- Legacy page styles are scoped and layered below component utilities. The old accent token no longer conflicts with shadcn's accent background. Print output resets the component palette and hides navigation.
- The catalogue index is emitted as a separate cacheable chunk so UI changes do not invalidate that data asset.

Validation for this migration: all 1,544 tests pass. The production build passes with zero Svelte errors/warnings and no bundle-size warning. The development browser sweep covers 90 route/state, width and theme/language combinations, including populated forms and results, with no axe violations or page overflow. A 60-check production sweep at 320px/1440px in light English and dark German also passes. Additional checks cover both settings tabs, the chamber tab, preview cards, the open mobile menu and a loaded target photograph. These caught a hidden file-picker overflow, which was fixed and rechecked at both widths.

Keyboard and workflow checks verify menu focus management, arrow-key tab navigation, unit-aware gun saving, record import preview/apply, cartridge copying, live bullet/target previews, photo calibration and marker creation. Dark-theme print emulation verifies white cards, dark text and hidden navigation. Automated checks remain limited to the exercised states and do not establish full WCAG conformance.

## Improvements

- Shared 44px control height, clearer input boundaries, consistent panel corners, responsive headings and aligned page spacing. The photo editor now uses the same button shapes and selection colors as the catalogue.
- Theme-aware error and warning colors in the editors and calculators. Inline links have underlines, clipped controls retain visible keyboard focus, and saved appearance is applied before the initial paint.
- Target specifications stack below the drawing on small screens. Filters use the available width, navigation stays compact, and long translated calculator controls stay inside their panels.
- Page changes focus the main content and reset the scroll position. Loading messages expose their status to assistive technology. Catalogue previews support keyboard scrolling without nested links.
- Photo points can be added with numeric coordinates and the keyboard. Existing coordinates, removal actions, zoom controls and selected tool options expose their names and states.
- Localized page titles and descriptions, individual record names in metadata, Open Graph defaults and a useful JavaScript-disabled fallback. The static description no longer contains a hard-coded record count.

## Verification

- `npm run build`: production build passes; Svelte reports zero errors and zero warnings.
- `npm test`: all 1,544 tests in 32 files pass.
- Browser review uses headless Microsoft Edge and axe-core 4.10.3, with WCAG 2 A/AA, 2.1 AA and 2.2 AA rule tags.
- Production browser audit: 60 checks across 15 routes at 390px and 1440px in light and dark themes, with zero reported accessibility violations and no page-level horizontal overflow. These cover the catalogue, bullet records, gun records, targets, settings, preview tools, editors, a loaded calculator, the sample photograph and representative detail records.
- Additional 320px German checks cover translated labels, the target layout, settings, a loaded calculator and the sample photograph. Keyboard checks confirm navigation focus, arrow-key drawing panning, and adding photo points with named coordinates.
- Automated checks supplement visual and keyboard inspection; they do not establish complete WCAG conformance. Screen-reader testing with NVDA/VoiceOver, high-contrast OS themes and real touch devices remain useful follow-up work.

## Further layout pass

All 14 page components now use a consistent content width, gutters and panel spacing. Shared panel, form-section and button components establish reusable defaults; `UI.md` describes their use. Search controls align on desktop, editors use balanced columns, drawing previews are centered, and settings fields align even when helper text wraps. The bullet editor uses labeled native selects for shape choices. No component-library dependencies were added.

The expanded browser sweep covers 15 routes/states at 320px, 768px and 1440px, in light English and dark German (90 combinations). It includes the open gun form with scope fields, populated trajectory results, scoring coordinates and the sample photograph. This found a German measurement-table overflow and a trajectory table that needed keyboard focus for scrolling. Both were fixed and all 12 affected route/width/theme combinations passed a targeted repeat with no axe violations or page overflow. The final production build again reports zero Svelte errors/warnings; all 1,544 tests in 32 files pass.

A final production smoke audit across all 15 routes/states at 1440px reports no axe violations or page overflow. Keyboard checks on the production build confirm arrow-key scrolling of the measurement table at 320px and changing the bullet shape select updates its drawing.

## SEO limitation

The current app uses `#/…` routes for GitHub Pages compatibility. Metadata makes browser tabs and rendered pages more descriptive, but hash routes do not give individual records reliably crawlable URLs. Google recommends real URLs and the History API for separate content; prerendering would also give crawlers and social preview services the content without executing JavaScript. See [Google's JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

A follow-up routing change should generate static HTML for the public catalogue and records, preserve existing hash links, work under the configured Pages base path, and generate canonical URLs and a sitemap from the actual deployment origin. No guessed production origin or hash-based sitemap was added in this review.

The accessibility review also follows the [W3C guidance on non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Shared colors and component boundaries should be checked again whenever the palette changes.
