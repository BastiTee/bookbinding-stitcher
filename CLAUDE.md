# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bookbinding Stitcher is an interactive application for designing **Long Stitch Binding** patterns used in bookmaking. Patterns are modeled as a connected graph on a discrete X/Y integer grid where edges represent thread paths with two "loads":

- **Positive (p):** Thread visible on the spine
- **Negative (n):** Thread inside binding a signature

Notation: `[load][start]-[end]`, e.g., `p0,0-1,1 n1,1-1,0 p1,0-0,1 n0,1-0,0`

## Commands

- `npm run dev` — start local dev server
- `npm run build` — typecheck with tsc then build with Vite
- `npm run preview` — preview production build locally (overrides base to `/` for local use)
- `npm test` — run tests with Vitest (tests live in `src/__tests__/`)
- `npx vitest run src/__tests__/anchor-loop.test.ts` — run a single test file
- `npx vitest run -t "test name pattern"` — run tests matching a name filter

## Tech Stack

Vite + TypeScript (vanilla, no framework). Deployed to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`.

**TypeScript strictness:** `noUnusedLocals` and `noUnusedParameters` are enabled — any unused import or variable is a build error (`npm run build`). Remove or use every declaration.

**Vite base path:** Dev server uses `base: "/"`. Production build uses `base: "/bookbinding-stitcher/"` (GitHub Pages subpath). `npm run preview` runs `vite build --base=/` to override for local testing.

## Architecture

`main.ts` creates a `GridModel` and calls `buildUI(container, model)`. Everything else flows from there.

**Three modes** (toggled via sidebar buttons in `ui.ts`):

| Mode | `currentMode` | What's active |
|------|--------------|---------------|
| Grid Design | `"design"` | `designPanel`, SVG click/move handlers in `ui.ts` |
| Sewing | `"sewing"` | `sewingPanelObj` (activate/deactivate pattern) |
| Playback | `"playback"` | `playbackPanelObj` (activate/deactivate pattern) |

**Module responsibilities:**
- `src/model.ts` — `GridModel` observable; spine dimensions + flat `holes: Hole[]` sorted array
- `src/sewing-model.ts` — `SewingModel` observable; threads with undo/redo (50-step history via JSON deep-clone snapshots). Also exports utility functions used by `sewing-ui.ts`: `getCurrentHole`, `getEligibleChainHoles`, `getEligibleAnchorLoopHoles`, `getEligibleHiddenLinkHoles`, `canEndWithKnot`
- `src/render.ts` — `renderGrid(svg, state, highlight)` — **clears `svg.innerHTML` on every call**
- `src/sewing-render.ts` — `renderSewing(svg, sewingState, sizes, spine, previewEdge?, options?, chainEligibleHoles?, hiddenLinkEligibleHoles?)` — removes and re-appends `<g class="sewing-layer">` each call
- `src/interaction.ts` — `screenToSvg`, `resolveTarget`, `snapToGrid`; proximity threshold is 10px converted to mm via CTM
- `src/dom-utils.ts` — shared DOM helpers: `el(tag, className?)`, `sectionTitle(text)`, `createModal(title, closeAriaLabel, extraClass?)` — **always use these instead of raw `document.createElement`**
- `src/ui.ts` — wires everything; owns the `refresh()` cycle; manages ghost layer
- `src/sewing-ui.ts` — `buildSewingPanel(...)` — returns `{ panel, activate, deactivate }`
- `src/playback-ui.ts` — `buildPlaybackPanel(...)` — returns `{ activate, deactivate }`
- `src/gallery-ui.ts` — `openGallery(onSelect)` — modal gallery of bundled examples; uses `import.meta.glob('/examples/**/*.json', { eager: true })` at module level (computed once, works identically in dev and dist). Examples are organized into sections by subdirectory name (leading `\d+-` stripped and title-cased). Files in `examples-experimental/` are **not** bundled into the gallery.
- `src/help-ui.ts` — `openHelp(currentMode)` — keyboard/mouse controls modal; highlights the active mode section
- `src/share.ts` — `encodePatternUrl(json)` / `readPatternFromHash()` — URL-based sharing; compresses JSON via `lz-string` into a `#p=…` hash fragment. Hash is read once at load (before `ui.ts` clears it after loading a shared pattern).
- `src/tour.ts` — `startTour(deps)` — first-run Driver.js onboarding tour. Skipped if `localStorage` key `bookbinding-tour-v1` is set or if a hash is present on page load (shared URL). Loads the first bundled example before starting the tour.
- `src/hover-menu.ts` — `HoverMenu` class — floating context-menu card positioned near a hole; auto-repositions to avoid viewport overflow; dismissed after a 200 ms delay on mouse-leave.
- `src/file-io.ts` — `saveAsFile`, `saveToHandle`, `openFilePicker` — file I/O helpers; uses the File System Access API (`showSaveFilePicker`) with a `<a download>` blob-URL fallback for browsers that don't support it.

**Critical rendering constraint:** `renderGrid` wipes `svg.innerHTML`, so the ghost layer and sewing layer must be re-appended after every grid render. The `refresh()` function in `ui.ts` always calls `ensureGhostLayer()` and `renderSewing()` after `renderGrid()`.

**Model change cascade:** Grid change → `sewingModel.reset()` → sewing subscriber fires `refresh()`. This prevents double-refresh.

**Panel activate/deactivate pattern:** Sewing and playback panels register/remove their own SVG event listeners (`mousemove`, `click`, `mouseleave`) and keyboard handlers in `activate()`/`deactivate()`. Design mode SVG handlers live directly in `ui.ts` and are guarded by `if (currentMode !== "design") return`.

## Key Domain Rules

**Grid model:** Holes are stored as a flat sorted array of `{x, y}` coordinates directly on the spine. The grid is sparse and explicit — only explicitly added holes exist. Column guide lines are derived by grouping holes by unique X value. Coordinates are non-negative integers.

**Graph constraints:**
- Graph must remain **connected** as edges are added sequentially; branches are allowed
- Edges must connect **two distinct points** — no self-loops; all edges are straight
- Points with degree > 1 must have **at least one positive and one negative edge** (enforces alternation)
- For each distinct **Y coordinate** appearing in any point, there must be **at least one negative edge** at that Y (signature security — Y identifies a signature row, not X)
- Negative edges can connect **any two distinct points** — the common case is same-Y (within one signature row), but cross-Y inside-spine paths are also valid
- Edges are **undirected** — `P0,0-P1,1` and `P1,1-P0,0` are the same edge

**Overlap:** Counted per side (positive and negative independently), locally per edge pair (shared segment, not just shared endpoints). Configurable maximum: 1 = no overlap allowed, 3 = up to three edges may share a segment. Repeated identical edges count as additional overlap.

## Binding Sequence

**1. Start:** User chooses a start side (positive/negative) then clicks a hole. Only one thread can be active at a time. The first edge drawn is always the **opposite** side from the start side (if thread starts positive, first edge is negative). Subsequent edges alternate automatically — this is managed by `activeThread.nextLoad`.

**2. Draw edges:** Each click on a hole extends the thread with a new edge from the current endpoint. Load alternates on every edge.

**2b. Chain stitch:** The thread can loop around an already-placed stitch at another hole before returning to its current position. Internally stored as `{ hole, side, afterEdge }` entries in `thread.chainStitches[]`, where `afterEdge` is the 0-based index of the edge that is "consumed" (its `from` is redirected to `cs.hole`). Rendered as a smooth teardrop by `drawChainStitchPath` in `sewing-render.ts` — two cubic beziers, no straight segments, sharp cusp at the thread position, round cap past the chain hole.

**2c. Hidden link stitch:** The thread travels inside the signature from hole A to hole B without passing through the spine. Only valid when `nextLoad="positive"` (replaces or redirects an outside pass). Two types triggered by different modifier keys:
- **Type 1 (negative)** `Shift+Alt+Click`: `nextLoad` flips positive→negative. The thread arrives at B ready for an inside pass — effectively skipping the outside pass.
- **Type 2 (positive)** `Ctrl/Cmd+Alt+Click`: `nextLoad` stays positive. The thread arrives at B still ready for an outside pass — the outside path continues from a new hole.

Internally stored as `{ from, to, side, afterEdge }` entries in `thread.hiddenLinkStitches[]`. **`side` is the output load after the link** (`"negative"` = type 1, `"positive"` = type 2) — NOT the load at creation time. The predecessor edge (arriving at `from`) is rendered in blue via class `thread-edge--hidden-link-origin`. The link itself renders as a blue dashed line (`.hidden-link-stitch`). Eligible targets are shown as blue dashed halos (`.hidden-link-eligible-halo`) during hover. Implemented via `sewingModel.addHiddenLinkStitch(to, kind)` / `removeLastHiddenLinkStitch()`.

**2a. Anchor loop:** At any point after the start hole is set, the user can place an anchor loop at the current endpoint. The loop is recorded on the `nextLoad` side — the thread dips into the spine and returns, so `nextLoad` flips twice (net: same as before). Implemented via `sewingModel.addAnchorLoop()`, triggered by the "Add Anchor Loop" button or Alt+Click. Rendered as a U-shape (horseshoe) above the hole in `drawAnchorLoop`.

**3. End thread:** User clicks "End Thread" (loose end) or "End Thread with Knot" (knot requires the current hole+load to coincide with an earlier thread pass). A completed thread is immutable. Multiple threads can coexist; `uncompleteThread(i)` re-opens one for editing.

## Export / Import JSON format

The textarea in the sidebar always contains the live JSON export. The schema is:

```jsonc
{
  "spine": { "width": 150, "height": 40 },
  "holes": [{ "x": 10, "y": 5 }, { "x": 10, "y": 20 }, { "x": 10, "y": 35 }],
  "metadata": { "title": "...", "author": "...", "description": "..." }, // optional
  "threads": [
    {
      "threadStart": { "side": "positive", "hole": { "x": 10, "y": 5 } },
      "threadEnd":   { "type": "loose"|"knot", "side": "...", "hole": {...} },
      "edges": [
        { "load": "positive", "from": {...}, "to": {...}, "index": 1 },
        // Chain stitch: chainedVia present means thread loops around that hole before reaching `to`.
        // `from` = position before the loop; `to` = return position (usually == `from`).
        { "load": "positive", "from": {...}, "chainedVia": {...}, "to": {...}, "index": 3 }
      ],
      "anchorLoops": [{ "hole": {...}, "side": "positive"|"negative", "afterEdge": 2 }, ...],
      "hiddenLinkStitches": [{ "from": {...}, "to": {...}, "side": "negative"|"positive", "afterEdge": 4 }, ...]
    }
  ]
}
```

**Internal vs. export chain stitch representation:** The internal `Thread` model stores chain stitches separately as `chainStitches: { hole, side, afterEdge }[]`. The JSON export merges them into their corresponding edge as `chainedVia`. `ui.ts` converts between formats on import/export — no other code touches this boundary.

**Hidden link stitch `side` field:** In `hiddenLinkStitches`, `side` is the **output load** after the link (`"negative"` = type 1, `"positive"` = type 2), not the load at creation time. This is the opposite convention from `anchorLoops.side` and `chainStitches.side`, which record the load at creation.

## Thread lifecycle

1. `sewingModel.beginThread(startSide)` — creates active thread; `nextLoad` is set to the opposite of `startSide`
2. `sewingModel.setThreadStartPoint(h)` — first click on a hole
3. `sewingModel.addEdge(to)` — subsequent clicks; load alternates automatically
4. `sewingModel.addAnchorLoop()` — places an anchor loop at the current endpoint; `nextLoad` flips twice (net unchanged)
4b. `sewingModel.addHiddenLinkStitch(to, kind)` — places a hidden link stitch; only valid when `nextLoad="positive"`. `kind="negative"` (type 1): flips nextLoad positive→negative. `kind="positive"` (type 2): nextLoad stays positive. Position advances to `to`.
5. `sewingModel.endThread()` → `endType: "loose"` | `sewingModel.endThreadWithKnot()` → `endType: "knot"` (knot requires current hole/load to coincide with a prior thread pass)
6. `sewingModel.uncompleteThread(i)` — re-opens a completed thread for editing; correctly reconstructs `nextLoad` accounting for any final hidden link stitch

Undo/redo operates on `SewingModel` only; grid changes are not undoable.

## UI Conventions

**Reset:** A single "Reset" button lives at the bottom of the metadata panel. It shows a `confirm()` dialog before calling `model.loadState({ spine: { width: 150, height: 40 }, holes: [] })`. The model subscriber cascade automatically fires `sewingModel.reset()` and `refresh()` — no extra calls needed.

**Modal dialogs:** All overlay modals use `createModal(title, closeAriaLabel, extraClass?)` from `src/dom-utils.ts`. It wires Escape, backdrop-click, and close-button dismissal, and returns `{ modal, close }`. Append content to `modal`; call `close()` from selection handlers when needed. Always guard against double-open at the top of the open function:
```ts
if (document.querySelector(".gallery-backdrop")) return;
```

**DOM helpers:** Use `el(tag, className?)` from `src/dom-utils.ts` for all element creation. Do not write bare `document.createElement` + `.className` pairs.

**Help button:** A floating "?" button (`.help-btn`) is absolutely positioned in the top-right of `.svg-panel` (which has `position: relative` in CSS). It calls `openHelp(currentMode)` from `src/help-ui.ts`. When adding new keyboard shortcuts, document them in `src/help-ui.ts`'s `SECTIONS` constant.

**Static bundled data:** Use `import.meta.glob('/path/*.json', { eager: true })` at **module level** (not inside a function) so the result is computed once. This works identically in `npm run dev` and the production dist — no manual variable changes needed.
```ts
// ✓ correct — computed once at module load
const rawModules = import.meta.glob('/examples/**/*.json', { eager: true });
const ENTRIES = Object.entries(rawModules).sort(...).map(...);

// ✗ wrong — recomputes on every call even though source data never changes
export function openGallery() {
  const entries = buildEntries();
}
```
