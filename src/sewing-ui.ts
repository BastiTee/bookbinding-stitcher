import type { GridModel } from "./model";
import { SewingModel, canEndWithKnot, getCurrentHole, getEligibleChainHoles, getEligibleAnchorLoopHoles, getEligibleHiddenLinkHoles, type Load, type Hole } from "./sewing-model";
import { renderSewing, type PreviewEdge } from "./sewing-render";
import { computeScaleSizes } from "./render";
import { screenToSvg, resolveTarget } from "./interaction";
import { el } from "./dom-utils";

export function buildSewingPanel(
  sidebar: HTMLElement,
  sewingModel: SewingModel,
  gridModel: GridModel,
  svg: SVGSVGElement,
  refresh: () => void,
): { panel: HTMLElement; activate: () => void; deactivate: () => void } {
  const panel = el("div", "sewing-panel hidden");

  // --- Thread section ---

  // Start side radio group
  const radioGroup = el("div", "radio-group");
  const radioPositive = radioOption("start-side", "positive", "Start thread outside", false);
  const radioNegative = radioOption("start-side", "negative", "Start thread inside", true);
  radioGroup.appendChild(radioNegative.wrapper);
  radioGroup.appendChild(radioPositive.wrapper);
  panel.appendChild(radioGroup);

  function getSelectedSide(): Load {
    return radioPositive.input.checked ? "positive" : "negative";
  }

  const threadError = el("div", "error-msg");

  const startBtn = button("Start Thread", () => {
    threadError.textContent = "";
    try {
      sewingModel.beginThread(getSelectedSide());
      updateThreadButtons();
    } catch (e) {
      threadError.textContent = (e as Error).message;
    }
  });

  const endBtn = button("End Thread", () => {
    threadError.textContent = "";
    try {
      sewingModel.endThread();
      updateThreadButtons();
    } catch (e) {
      threadError.textContent = (e as Error).message;
    }
  });

  const endKnotBtn = button("End Thread with Knot", () => {
    threadError.textContent = "";
    try {
      sewingModel.endThreadWithKnot();
      updateThreadButtons();
    } catch (e) {
      threadError.textContent = (e as Error).message;
    }
  });

  const cancelBtn = button("Cancel Thread", () => {
    threadError.textContent = "";
    sewingModel.cancelThread();
    clearPreview();
    updateThreadButtons();
  });

  panel.appendChild(startBtn);
  panel.appendChild(cancelBtn);
  panel.appendChild(endBtn);
  panel.appendChild(endKnotBtn);
  panel.appendChild(threadError);

  // --- Undo / Redo ---
  const undoRedoRow = el("div", "undo-redo-row");
  const undoBtn = button("↩ Undo", () => {
    sewingModel.undo();
    updateThreadButtons();
  });
  const redoBtn = button("↪ Redo", () => {
    sewingModel.redo();
    updateThreadButtons();
  });
  undoRedoRow.appendChild(undoBtn);
  undoRedoRow.appendChild(redoBtn);
  panel.appendChild(undoRedoRow);

  const nextEdgeLabel = el("div", "next-edge-label");
  panel.appendChild(nextEdgeLabel);

  sidebar.appendChild(panel);

  // --- State for preview ---
  let previewEdge: PreviewEdge | null = null;
  let chainEligibleHoles: Hole[] = [];
  let anchorLoopEligiblePoints: Hole[] = [];
  let hiddenLinkEligibleHoles: Hole[] = [];

  function clearPreview() {
    previewEdge = null;
    chainEligibleHoles = [];
    anchorLoopEligiblePoints = [];
    hiddenLinkEligibleHoles = [];
  }

  function updateThreadButtons() {
    const state = sewingModel.getState();
    const active = state.activeThread;
    const hasActive = active !== null;
    const hasEdges = hasActive && active.edges.length > 0;
    const hasStartPoint = hasActive && active.startHole !== null;

    startBtn.classList.toggle("hidden", hasActive);
    radioPositive.input.disabled = hasActive;
    radioNegative.input.disabled = hasActive;
    cancelBtn.disabled = !hasActive;
    endBtn.disabled = !hasEdges;
    endKnotBtn.disabled = !(hasEdges && active !== null && canEndWithKnot(active, state.threads));

    undoBtn.disabled = !sewingModel.canUndo();
    redoBtn.disabled = !sewingModel.canRedo();

    if (active) {
      if (!hasStartPoint) {
        nextEdgeLabel.textContent = `Click a hole to set thread start`;
      } else {
        const load = active.nextLoad === "positive" ? "spine (positive)" : "inside (negative)";
        nextEdgeLabel.textContent = `Next edge: ${load}`;
      }
    } else {
      nextEdgeLabel.textContent = "";
    }
  }

  // --- Keyboard shortcuts ---
  function onKeyDown(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === "z" || e.key === "Z") {
      if (e.shiftKey) {
        e.preventDefault();
        sewingModel.redo();
        updateThreadButtons();
      } else {
        e.preventDefault();
        sewingModel.undo();
        updateThreadButtons();
      }
    }
  }

  // --- SVG event handlers ---
  function onMouseMove(e: MouseEvent) {
    const state = sewingModel.getState();
    const active = state.activeThread;
    if (!active || !active.startHole) {
      clearPreview();
      return;
    }

    const coord = screenToSvg(svg, e);
    const gridState = gridModel.getState();
    const sizes = computeScaleSizes(gridState.spine);
    const from = getCurrentHole(active)!;

    chainEligibleHoles = getEligibleChainHoles(active, state.threads);
    anchorLoopEligiblePoints = getEligibleAnchorLoopHoles(active, state.threads);
    hiddenLinkEligibleHoles = getEligibleHiddenLinkHoles(active, gridState.holes);

    const target = resolveTarget(svg, coord, gridState);
    if (target.kind === "hole" && target.holeX !== undefined && target.holeY !== undefined) {
      const to: Hole = { x: target.holeX, y: target.holeY };
      if (to.x !== from.x || to.y !== from.y) {
        previewEdge = { from, to, load: active.nextLoad };
      } else {
        previewEdge = null;
      }
    } else {
      previewEdge = null;
    }

    renderSewing(svg, sewingModel.getState(), sizes, gridState.spine, previewEdge, { anchorLoopEligiblePoints }, chainEligibleHoles, hiddenLinkEligibleHoles);
  }

  function onMouseLeave() {
    previewEdge = null;
    chainEligibleHoles = [];
    hiddenLinkEligibleHoles = [];
    const gridState = gridModel.getState();
    const sizes = computeScaleSizes(gridState.spine);
    renderSewing(svg, sewingModel.getState(), sizes, gridState.spine, null, {}, [], []);
  }

  function onClick(e: MouseEvent) {
    threadError.textContent = "";
    const state = sewingModel.getState();
    const active = state.activeThread;

    // Alt/Option+Click: anchor loop (checked first — takes priority over Shift+Alt combos)
    if (e.altKey) {
      if (active?.startHole) {
        try {
          sewingModel.addAnchorLoop();
          updateThreadButtons();
          refresh();
        } catch (err) {
          threadError.textContent = (err as Error).message;
        }
      }
      return;
    }

    const coord = screenToSvg(svg, e);
    const gridState = gridModel.getState();
    const target = resolveTarget(svg, coord, gridState);
    if (target.kind !== "hole" || target.holeX === undefined || target.holeY === undefined) return;
    const p: Hole = { x: target.holeX, y: target.holeY };

    try {
      // Shift+Ctrl/⌘+Click: type 2 hidden link stitch (nextLoad stays positive).
      if (e.shiftKey && (e.ctrlKey || e.metaKey)) {
        if (active?.startHole) {
          try {
            sewingModel.addHiddenLinkStitch(p, "positive");
            updateThreadButtons();
            refresh();
          } catch (err) {
            threadError.textContent = (err as Error).message;
          }
        }
        return;
      }

      // Ctrl/⌘+Click: type 1 hidden link stitch (nextLoad flips positive→negative).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        if (active?.startHole) {
          try {
            sewingModel.addHiddenLinkStitch(p, "negative");
            updateThreadButtons();
            refresh();
          } catch (err) {
            threadError.textContent = (err as Error).message;
          }
        }
        return;
      }

      // Shift+Click: chain stitch at an eligible hole.
      if (e.shiftKey) {
        if (!active?.startHole) return;
        const from = getCurrentHole(active);
        if (!from || (p.x === from.x && p.y === from.y)) return;
        const eligible = getEligibleChainHoles(active, state.threads);
        const eligibleAnchorLoops = getEligibleAnchorLoopHoles(active, state.threads);
        const isEligible =
          eligible.some(ep => ep.x === p.x && ep.y === p.y) ||
          eligibleAnchorLoops.some(ep => ep.x === p.x && ep.y === p.y);
        if (!isEligible) {
          threadError.textContent = "This hole is not eligible for chain stitch";
          return;
        }
        sewingModel.addChainStitch(p);
        updateThreadButtons();
        refresh();
        return;
      }

      if (!active) return;

      if (!active.startHole) {
        sewingModel.setThreadStartPoint(p);
      } else {
        const from = getCurrentHole(active);
        if (from && (p.x === from.x && p.y === from.y)) return;
        sewingModel.addEdge(p);
      }
      updateThreadButtons();
      refresh();
    } catch (err) {
      threadError.textContent = (err as Error).message;
    }
  }

  function activate() {
    panel.classList.remove("hidden");
    svg.addEventListener("mousemove", onMouseMove);
    svg.addEventListener("click", onClick);
    svg.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("keydown", onKeyDown);
    updateThreadButtons();
  }

  function deactivate() {
    panel.classList.add("hidden");
    svg.removeEventListener("mousemove", onMouseMove);
    svg.removeEventListener("click", onClick);
    svg.removeEventListener("mouseleave", onMouseLeave);
    document.removeEventListener("keydown", onKeyDown);
    clearPreview();
  }

  return { panel, activate, deactivate };
}

// --- Helpers ---

function button(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}

function radioOption(name: string, value: string, label: string, checked: boolean): { wrapper: HTMLDivElement; input: HTMLInputElement } {
  const wrapper = document.createElement("div");
  wrapper.className = "radio-option";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  const lbl = document.createElement("label");
  lbl.textContent = label;
  wrapper.appendChild(input);
  wrapper.appendChild(lbl);
  return { wrapper, input };
}
