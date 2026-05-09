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
- `npm run preview` — preview production build locally

## Tech Stack

Vite + TypeScript (vanilla, no framework). Deployed to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`.

## Architecture

`main.ts` creates a `GridModel` and calls `buildUI(container, model)`. Everything else flows from there.

**Three modes** (toggled via sidebar buttons in `ui.ts`):

| Mode | `currentMode` | What's active |
|------|--------------|---------------|
| Grid Design | `"design"` | `designPanel`, SVG click/move handlers in `ui.ts` |
| Sewing | `"sewing"` | `sewingPanelObj` (activate/deactivate pattern) |
| Playback | `"playback"` | `playbackPanelObj` (activate/deactivate pattern) |

**Module responsibilities:**
- `src/model.ts` — `GridModel` observable; spine dimensions + stations/holes as sorted arrays
- `src/sewing-model.ts` — `SewingModel` observable; threads with undo/redo (50-step history via JSON deep-clone snapshots)
- `src/render.ts` — `renderGrid(svg, state, highlight)` — **clears `svg.innerHTML` on every call**
- `src/sewing-render.ts` — `renderSewing(svg, sewingState, sizes, spine, previewEdge?, options?)` — removes and re-appends `<g class="sewing-layer">` each call
- `src/interaction.ts` — `screenToSvg`, `resolveTarget`, `snapToGrid`; proximity threshold is 10px converted to mm via CTM
- `src/ui.ts` — wires everything; owns the `refresh()` cycle; manages ghost layer
- `src/sewing-ui.ts` — `buildSewingPanel(...)` — returns `{ panel, activate, deactivate }`
- `src/playback-ui.ts` — `buildPlaybackPanel(...)` — returns `{ activate, deactivate }`

**Critical rendering constraint:** `renderGrid` wipes `svg.innerHTML`, so the ghost layer and sewing layer must be re-appended after every grid render. The `refresh()` function in `ui.ts` always calls `ensureGhostLayer()` and `renderSewing()` after `renderGrid()`.

**Model change cascade:** Grid change → `sewingModel.reset()` → sewing subscriber fires `refresh()`. This prevents double-refresh.

**Panel activate/deactivate pattern:** Sewing and playback panels register/remove their own SVG event listeners (`mousemove`, `click`, `mouseleave`) and keyboard handlers in `activate()`/`deactivate()`. Design mode SVG handlers live directly in `ui.ts` and are guarded by `if (currentMode !== "design") return`.

## Key Domain Rules

**Grid model:** Points exist only where a station (vertical column at a specific X mm) has a hole at a specific Y mm. The grid is sparse and explicit — not every X/Y combination is valid, only station+hole intersections. Coordinates are non-negative integers.

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

**2b. Chain stitch:** The thread can loop around an already-placed stitch at another hole before returning to its current position. Internally stored as `{ point, side, afterEdge }` entries in `thread.chainStitches[]`, where `afterEdge` is the 0-based index of the edge that is "consumed" (its `from` is redirected to `cs.point`). Rendered as a smooth teardrop by `drawChainStitchPath` in `sewing-render.ts` — two cubic beziers, no straight segments, sharp cusp at the thread position, round cap past the chain hole.

**2a. Anchor loop:** At any point after the start hole is set, the user can place an anchor loop at the current endpoint. The loop is recorded on the `nextLoad` side — the thread dips into the spine and returns, so `nextLoad` flips twice (net: same as before). Implemented via `sewingModel.addAnchorLoop()`, triggered by the "Add Anchor Loop" button or Alt+Click. Rendered as a U-shape (horseshoe) above the hole in `drawAnchorLoop`.

**3. End thread:** User clicks "End Thread" (loose end) or "End Thread with Knot" (knot requires the current point+load to coincide with an earlier thread pass). A completed thread is immutable. Multiple threads can coexist; `uncompleteThread(i)` re-opens one for editing.

## Export / Import JSON format

The textarea in the sidebar always contains the live JSON export. The schema is:

```jsonc
{
  "spine": { "width": 150, "height": 40 },
  "stations": [{ "x": 10, "holes": [5, 20, 35] }],
  "metadata": { "title": "...", "author": "...", "description": "..." }, // optional
  "threads": [
    {
      "threadStart": { "side": "positive", "point": { "x": 10, "y": 5 } },
      "threadEnd":   { "type": "loose"|"knot", "side": "...", "point": {...} },
      "edges": [
        { "load": "positive", "from": {...}, "to": {...}, "index": 1 },
        // Chain stitch: chainedVia present means thread loops around that hole before reaching `to`.
        // `from` = position before the loop; `to` = return position (usually == `from`).
        { "load": "positive", "from": {...}, "chainedVia": {...}, "to": {...}, "index": 3 }
      ],
      "anchorLoops": [{ "point": {...}, "side": "positive"|"negative", "afterEdge": 2 }, ...]
    }
  ]
}
```

**Internal vs. export chain stitch representation:** The internal `Thread` model stores chain stitches separately as `chainStitches: { point, side, afterEdge }[]`. The JSON export merges them into their corresponding edge as `chainedVia`. `ui.ts` converts between formats on import/export — no other code touches this boundary.

## Thread lifecycle

1. `sewingModel.beginThread(startSide)` — creates active thread; `nextLoad` is set to the opposite of `startSide`
2. `sewingModel.setThreadStartPoint(p)` — first click on a hole
3. `sewingModel.addEdge(to)` — subsequent clicks; load alternates automatically
4. `sewingModel.addAnchorLoop()` — places an anchor loop at the current endpoint; `nextLoad` flips twice (net unchanged)
5. `sewingModel.endThread()` → `endType: "loose"` | `sewingModel.endThreadWithKnot()` → `endType: "knot"` (knot requires current point/load to coincide with a prior thread pass)
6. `sewingModel.uncompleteThread(i)` — re-opens a completed thread for editing

Undo/redo operates on `SewingModel` only; grid changes are not undoable.
