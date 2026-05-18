## 1. Mode-switching consolidation (`ui.ts`)

- [x] 1.1 Read the three `switchToDesign`, `switchToSewing`, `switchToPlayback` functions and map all differences
- [x] 1.2 Introduce `switchMode(mode: Mode)` that covers all three cases; add early-return guard for same-mode calls
- [x] 1.3 Replace all call sites with `switchMode("design" | "sewing" | "playback")`
- [x] 1.4 Delete the three old functions; verify `npm run build` passes (no unused symbols)
- [x] 1.5 Run `npm test` and manually smoke-test all three mode buttons in the browser

## 2. `flashSaved` helper and `el()` consistency (`ui.ts`)

- [x] 2.1 Extract the "Saved!" flash pattern into `flashSaved(btn: HTMLButtonElement)` helper
- [x] 2.2 Replace both inline flash call-sites with `flashSaved(...)`
- [x] 2.3 Replace remaining bare `document.createElement` calls with `el()` from `dom-utils.ts`
- [x] 2.4 Run `npm run build` and `npm test`

## 3. `withHistory` wrapper (`sewing-model.ts`)

- [x] 3.1 Add private `withHistory(fn: (s: SewingState) => SewingState): void` method implementing snapshot → mutate → notify
- [x] 3.2 Migrate each public mutating method (`addEdge`, `addAnchorLoop`, `addHiddenLinkStitch`, `removeLastHiddenLinkStitch`, `setThreadStartPoint`, `endThread`, `endThreadWithKnot`, `uncompleteThread`, `beginThread`, `reset`, and any others) to use `withHistory`
- [x] 3.3 Verify history cap is still enforced at 50 steps in `withHistory`
- [x] 3.4 Run `npm test` — undo/redo tests must pass; manually test multi-step undo in the browser

## 4. Menu-item factory (`sewing-ui.ts`)

- [x] 4.1 Add `createMenuItem(label: string, enabled: boolean, action: () => void)` factory inside `buildMenuItems` (or as a file-local helper)
- [x] 4.2 Rewrite all 8 menu items in `buildMenuItems()` to use `createMenuItem`; preserve exact labels, enabled conditions, and actions
- [x] 4.3 For items with post-action conditional logic, pass the full action body as the callback
- [x] 4.4 Run `npm run build` and `npm test`; manually exercise each menu item in the browser

## 5. Axis-parameterised rendering loops (`render.ts`)

- [x] 5.1 Identify the duplicated X/Y grid-line loop pair and the duplicated signature-button loop pair
- [x] 5.2 Extract a `renderGridLines(svg, holes, axis: "x" | "y", ...)` helper (or a unified loop with axis param)
- [x] 5.3 Extract a `renderSignatureButtons(svg, holes, axis: "x" | "y", ...)` helper
- [x] 5.4 Replace the original four loops with calls to the two helpers
- [x] 5.5 Run `npm run build` and `npm test`; visually verify grid appearance is unchanged

## 6. Split `drawEdgeLine` (`sewing-render.ts`)

- [x] 6.1 Extract `drawStraightEdge(parent, from, to, cls)` from the straight-edge branch of `drawEdgeLine`
- [x] 6.2 Extract `drawCurvedEdge(parent, from, to, cls, curvature)` from the curved-edge branch
- [x] 6.3 Reduce `drawEdgeLine` to a dispatcher that calls one of the two helpers
- [x] 6.4 Run `npm run build` and `npm test`; visually verify straight and curved edges render identically
