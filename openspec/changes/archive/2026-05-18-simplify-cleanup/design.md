## Context

The codebase has grown organically over several features. The main interactive modules (`ui.ts`, `sewing-ui.ts`, `sewing-model.ts`, `sewing-render.ts`, `render.ts`) contain repeated boilerplate that emerged from copy-paste-and-adapt development. No external dependencies are added; the stack remains Vite + vanilla TypeScript.

Current pain points:
- Three `switchTo*()` functions in `ui.ts` (lines 286-323) are structurally identical — each sets an active class on a button, calls `deactivate()` on the old panel, and `activate()` on the new one.
- `buildMenuItems()` in `sewing-ui.ts` is 212 lines because each of ~8 menu items inlines the full guard/action/refresh/teardown sequence rather than delegating to a helper.
- Every mutating method in `sewing-model.ts` (15+ methods) repeats: snapshot → mutate → notify observers. The save and notify steps are identical across all of them.
- `render.ts` loops over X and Y coordinates twice with near-identical bodies; signature-button loops likewise duplicated.
- `sewing-render.ts` `drawEdgeLine()` mixes straight-edge and curve-edge logic in a single function with a long `if/else` branch.
- A handful of raw `document.createElement` calls remain in `ui.ts` alongside the established `el()` helper from `dom-utils.ts`.

## Goals / Non-Goals

**Goals:**
- Reduce total lines of code in the five target files without changing any public API or observable behaviour.
- Introduce helpers that make future feature additions follow a consistent pattern.
- Keep all existing tests green after each step.
- Each refactoring step is independently reviewable and committable.

**Non-Goals:**
- No UI or visual changes.
- No JSON-format changes (export/import compatibility preserved exactly).
- No new user-facing features.
- No changes to `model.ts`, `interaction.ts`, `dom-utils.ts`, `file-io.ts`, `hover-menu.ts`, `help-ui.ts`, `gallery-ui.ts`, `share.ts`, or `tour.ts`.
- No test rewriting (tests stay as-is; passing them is the acceptance criterion).

## Decisions

### 1 — Single `switchMode(mode: Mode)` in `ui.ts`

Replace the three `switchToDesign / switchToSewing / switchToPlayback` functions with one parameterised function:

```ts
function switchMode(next: Mode) {
  if (currentMode === next) return;
  deactivateCurrentPanel();
  currentMode = next;
  activateCurrentPanel();
  updateModeSwitcherButtons();
}
```

The three public call-sites become `switchMode("design")` etc. Considered keeping three functions for readability; rejected because they already diverge in subtle ways (button-class names, null-checks), and a single function makes that uniform.

### 2 — `createMenuItem` factory in `sewing-ui.ts`

A small factory:
```ts
function createMenuItem(label: string, enabled: boolean, action: () => void) {
  return { label, enabled, onClick: () => { action(); clearPreviewState(); refresh(); updatePanel(); } };
}
```
Each menu item becomes one `createMenuItem(...)` call. Items that need conditional logic after the action can pass a richer callback. Considered a class-based `MenuItem` builder; rejected as overkill for 8 items.

### 3 — `withHistory` wrapper in `sewing-model.ts`

```ts
private withHistory(fn: (s: SewingState) => SewingState): void {
  this.snapshots.push(snapshot(this.state));
  if (this.snapshots.length > HISTORY_LIMIT) this.snapshots.shift();
  this.state = fn(this.state);
  this.notify();
}
```
Every public mutating method delegates to `withHistory`. This eliminates ~3 lines of boilerplate per method (15 methods → ~45 lines saved). Considered a decorator pattern; rejected because TypeScript method decorators add complexity for minimal gain here.

### 4 — Axis-parameterised rendering loops in `render.ts`

Merge the duplicated X/Y grid-line and signature-button loops into one helper that accepts `axis: "x" | "y"`. Reduces ~60 lines to ~30.

### 5 — Split `drawEdgeLine` in `sewing-render.ts`

Extract `drawStraightEdge(from, to, cls)` and `drawCurvedEdge(from, to, cls, curvature)` as private helpers. `drawEdgeLine` becomes a two-line dispatcher.

### 6 — `flashSaved(btn)` helper and `el()` consistency in `ui.ts`

Extract the two "Saved!" flash patterns into a single helper. Replace the remaining bare `document.createElement` calls with `el()`.

## Risks / Trade-offs

- **Risk: behavioural regression in mode switching** → Mitigation: manual smoke test of all three modes plus running existing tests after step 1.
- **Risk: menu item ordering or guard logic changes** → Mitigation: read all eight items carefully before extracting; diff the render output before/after.
- **Risk: undo/redo state corruption from `withHistory` centralisation** → Mitigation: run the full undo/redo test in `src/__tests__/` after step 3; manually verify multi-thread undo in browser.
- **Trade-off: slightly more indirection** — callers now go through wrappers. Accepted because each wrapper is ≤5 lines and lives in the same file.
