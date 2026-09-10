# TODOs

## Next improvements

- [ ] Handle cartridge save and delete failures in `site/src/routes/CartridgeDesigner.svelte`.
  Preserve the draft, show an error and disable duplicate saves while a write is pending.
- [ ] Make the Pages deployment depend on passing tests. The build and test workflows currently
  run independently, so a passing build can deploy while tests fail.
- [ ] Add local save, reopen and backup support for personal bullets. Plan a compatible storage
  and backup migration before implementation.
- [ ] Add keyboard interaction to the bullet photo editor and resolve its accessibility warning.
- [ ] Turn the manual browser checks into repeatable smoke tests for navigation, record storage,
  shared search controls, unit conversions and narrow layouts.

These are proposed follow-ups, not completed work. Order them by dependencies before execution.

## Context

- [Original cleanup requests](cleanup-notes.md)
- [Current application workflows](../docs/APP-WORKFLOWS.md)
- [Longer-term roadmap](../docs/ROADMAP.md)
