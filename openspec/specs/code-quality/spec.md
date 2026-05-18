# Code Quality

### Requirement: Mode switching uses a single unified function
The system SHALL manage mode transitions through a single `switchMode(mode)` function in `ui.ts`. All three mode-switch entry points (design, sewing, playback) SHALL delegate to this function.

#### Scenario: Switch between modes without visual regression
- **WHEN** the user clicks any mode-switcher button
- **THEN** the correct panel activates, the button receives the active class, and the previously active panel deactivates — identical to the pre-refactor behaviour

#### Scenario: No double-switch for same mode
- **WHEN** `switchMode` is called with the mode that is already active
- **THEN** no state change or re-render occurs

### Requirement: Sewing menu items are declared via a factory helper
The system SHALL use a `createMenuItem` factory in `sewing-ui.ts` so that each context-menu item is expressed in a single call rather than repeating the guard/action/refresh/teardown pattern inline.

#### Scenario: All existing menu items continue to appear with correct labels and enabled states
- **WHEN** the user hovers a hole during sewing mode
- **THEN** the context menu shows the same items, in the same order, with the same enabled/disabled states as before the refactor

#### Scenario: Menu action side effects are unchanged
- **WHEN** the user selects any menu item
- **THEN** `clearPreviewState()`, `refresh()`, and `updatePanel()` are still called after the action

### Requirement: SewingModel state mutations use a `withHistory` wrapper
The system SHALL centralise snapshot-save and observer-notify boilerplate into a private `withHistory(fn)` method in `sewing-model.ts`. Every public mutating method SHALL delegate to it.

#### Scenario: Undo restores the previous state
- **WHEN** the user performs an action and then triggers undo
- **THEN** the sewing state is identical to the state before the action

#### Scenario: Redo re-applies a previously undone action
- **WHEN** the user undoes an action and then triggers redo
- **THEN** the sewing state is identical to the state after the original action

#### Scenario: History is capped at 50 steps
- **WHEN** more than 50 mutations are performed without undo
- **THEN** only the most recent 50 states are retained in the undo stack

### Requirement: Grid rendering helpers eliminate duplicated axis loops
`render.ts` SHALL use shared axis-parameterised helpers for grid-line and signature-button rendering, replacing the duplicated X/Y loop pairs.

#### Scenario: Grid renders identically to pre-refactor
- **WHEN** the grid is rendered after the refactor
- **THEN** all grid lines, holes, and signature buttons appear in the same positions as before

### Requirement: Edge rendering uses split helpers
`sewing-render.ts` SHALL expose `drawStraightEdge` and `drawCurvedEdge` as separate private helpers; `drawEdgeLine` SHALL dispatch to them.

#### Scenario: Straight and curved edges render identically to pre-refactor
- **WHEN** a pattern with both straight and curved edges is rendered
- **THEN** the visual output is pixel-identical to the pre-refactor render

### Requirement: DOM element creation is consistent
All element creation in `ui.ts` SHALL use the `el()` helper from `dom-utils.ts`. No bare `document.createElement` calls SHALL remain.

#### Scenario: UI renders without errors after helper consolidation
- **WHEN** the application is loaded after the refactor
- **THEN** all UI elements are present and functional with no console errors

### Requirement: Saved-feedback flash is extracted to a helper
The "Saved!" button-text flash pattern in `ui.ts` SHALL be implemented via a single `flashSaved(btn)` helper rather than inline at each call site.

#### Scenario: Save feedback still displays and resets
- **WHEN** the user saves a file or copies to clipboard
- **THEN** the button text briefly shows "Saved!" and then reverts to its original label
