# Interface and writing conventions

- Use OpenBallistics as the project identity. Code, documentation and workflows must not name
  or depend on sibling projects. Keep required test fixtures in this repository.
- Project feedback, contribution and repository links must target `PiMetry/OpenBallistics`.
  Use the shared destination in `site/src/lib/repository.ts`; deployment settings must not
  redirect these links. Feedback links report issues; they do not create database records.

- Use plain ASCII hyphens where a dash is needed. Do not use em dashes, en dashes, figure dashes,
  horizontal bars or doubled hyphens as sentence punctuation. Prefer a comma, colon or a new sentence.
- Keep the action named for the record: Add cartridge, Add bullet, Add gun, Add target.
  A method such as entering dimensions or measuring a photo belongs inside the creation workflow.
- Database and workspace page headings use `PageHeader`. Primary creation actions use `AddAction`.
  Keep the title and description on the left and the creation action on the right, wrapping on mobile.
- Use a parent-database back link on creation pages. Keep contribution links secondary and label
  their external destination explicitly. Do not label an external submission as a local save.
- Use the shared theme tokens for surfaces, borders, typography, spacing and focus indicators.
- Use `--control-height` for single-line inputs, selects and matching toolbar controls.
- Catalogue search uses `SearchPanel`: a full-width search field, then filters and optional
  sort controls. Use `ResultsSummary` for counts, clearing filters and view controls.
- Keep plausibility findings and verification workflows out of the interface. Source references
  and ordinary form errors remain part of the records and editing workflows.
- Keep English and German action labels aligned and verify narrow screens in both languages.
