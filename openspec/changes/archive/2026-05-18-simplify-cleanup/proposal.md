## Why

Several key files (`ui.ts`, `sewing-ui.ts`, `sewing-model.ts`, `sewing-render.ts`) have grown with repeated boilerplate patterns — identical mode-switch logic, copy-pasted menu-item callbacks, and save-history-then-notify sequences scattered across 15+ methods. These patterns make the code harder to extend and easier to introduce bugs in. This refactor eliminates the duplication without changing any user-visible behaviour.

## What Changes

- **Mode switching consolidated**: `switchToDesign()`, `switchToSewing()`, `switchToPlayback()` in `ui.ts` replaced by a single `switchMode(mode)` function that sets classes and activates/deactivates panels generically.
- **Menu-item factory extracted**: `sewing-ui.ts` `buildMenuItems()` (212 lines) reduced with a `createMenuItem(label, condition, action)` helper so each item is ~3 lines instead of ~25.
- **State-mutation wrapper**: `sewing-model.ts` gains a private `withHistory(fn)` helper; every mutating method calls it instead of repeating the save-snapshot / call-notify boilerplate.
- **SVG rendering helpers**: `render.ts` grid-line and signature-button loops are deduplicated; `sewing-render.ts` extracts `drawStraightEdge` / `drawCurvedEdge` helpers out of the monolithic `drawEdgeLine`.
- **DOM-helper consistency**: remaining raw `document.createElement` calls in `ui.ts` replaced with the `el()` helper from `dom-utils.ts`.
- **Repeated "Saved!" feedback**: extracted to a tiny `flashSaved(btn)` helper in `ui.ts`.

## Capabilities

### New Capabilities

- `code-quality`: Internal code-quality improvements — no new end-user features; all public behaviour preserved exactly.

### Modified Capabilities

<!-- No spec-level behaviour changes — this is a pure implementation refactor. -->

## Impact

- `src/ui.ts`, `src/sewing-ui.ts`, `src/sewing-model.ts`, `src/render.ts`, `src/sewing-render.ts` are modified.
- No API changes; no JSON-format changes; no visual changes.
- Existing test suite must continue to pass after each step.
