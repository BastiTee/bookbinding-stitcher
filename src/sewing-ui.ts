import type { GridModel } from "./model";
import { SewingModel, canEndWithKnot, getCurrentPoint, getEligibleChainHoles, getEligibleAnchorLoopChainPoints, type Load, type Point } from "./sewing-model";
import { renderSewing, type PreviewEdge } from "./sewing-render";
import { computeScaleSizes } from "./render";
import { screenToSvg, resolveTarget } from "./interaction";
import { el, sectionTitle } from "./dom-utils";

export function buildSewingPanel(
  sidebar: HTMLElement,
  sewingModel: SewingModel,
  gridModel: GridModel,
  svg: SVGSVGElement,
  refresh: () => void,
): { panel: HTMLElement; activate: () => void; deactivate: () => void } {
  const panel = el("div", "sewing-panel hidden");

  // --- Thread section ---
  panel.appendChild(sectionTitle("Thread"));

  // Start side radio group
  const radioGroup = el("div", "radio-group");
  const radioPositive = radioOption("start-side", "positive", "Spine (positive)", true);
  const radioNegative = radioOption("start-side", "negative", "Inside (negative)", false);
  radioGroup.appendChild(radioPositive.wrapper);
  radioGroup.appendChild(radioNegative.wrapper);
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
  endBtn.classList.add("hidden");

  const endKnotBtn = button("End Thread with Knot", () => {
    threadError.textContent = "";
    try {
      sewingModel.endThreadWithKnot();
      updateThreadButtons();
    } catch (e) {
      threadError.textContent = (e as Error).message;
    }
  });
  endKnotBtn.classList.add("hidden");

  const anchorLoopBtn = button("Add Anchor loop", () => {
    threadError.textContent = "";
    try {
      sewingModel.addAnchorLoop();
      updateThreadButtons();
    } catch (e) {
      threadError.textContent = (e as Error).message;
    }
  });
  anchorLoopBtn.classList.add("hidden");

  const cancelBtn = button("Cancel Thread", () => {
    threadError.textContent = "";
    sewingModel.cancelThread();
    clearPreview();
    updateThreadButtons();
  });
  cancelBtn.classList.add("hidden");

  panel.appendChild(startBtn);
  panel.appendChild(endBtn);
  panel.appendChild(endKnotBtn);
  panel.appendChild(anchorLoopBtn);
  panel.appendChild(cancelBtn);
  panel.appendChild(threadError);

  // --- Reset (sewing only) ---
  const resetBtn = button("Reset Threads", () => {
    sewingModel.reset();
    clearPreview();
    updateThreadButtons();
  });
  resetBtn.classList.add("reset-btn");
  panel.appendChild(resetBtn);

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

  // --- Controls section ---
  panel.appendChild(sectionTitle("Controls"));
  const controlsList = el("dl", "controls-list");
  controlsList.innerHTML =
    "<dt>Click</dt><dd>Set start / draw edge</dd>" +
    "<dt>Alt+Click</dt><dd>Add anchor loop at current point</dd>" +
    "<dt>Shift+Click</dt><dd>Delete last edge or chain stitch</dd>" +
    "<dt>Ctrl/Cmd+Click</dt><dd>Chain stitch at eligible hole (orange ring)</dd>" +
    "<dt>Ctrl+Z</dt><dd>Undo</dd>" +
    "<dt>Ctrl+Shift+Z</dt><dd>Redo</dd>";
  panel.appendChild(controlsList);

  const nextEdgeLabel = el("div", "next-edge-label");
  panel.appendChild(nextEdgeLabel);

  sidebar.appendChild(panel);

  // --- State for preview ---
  let previewEdge: PreviewEdge | null = null;
  let chainEligibleHoles: Point[] = [];
  let anchorLoopEligiblePoints: Point[] = [];

  function clearPreview() {
    previewEdge = null;
    chainEligibleHoles = [];
    anchorLoopEligiblePoints = [];
  }

  function updateThreadButtons() {
    const state = sewingModel.getState();
    const active = state.activeThread;
    const hasActive = active !== null;
    const hasEdges = hasActive && active.edges.length > 0;
    const hasStartPoint = hasActive && active.startPoint !== null;

    startBtn.classList.toggle("hidden", hasActive);
    radioGroup.classList.toggle("hidden", hasActive);
    endBtn.classList.toggle("hidden", !(hasEdges));
    endKnotBtn.classList.toggle(
      "hidden",
      !(hasEdges && active !== null && canEndWithKnot(active, state.threads)),
    );
    anchorLoopBtn.classList.toggle("hidden", !hasStartPoint);
    cancelBtn.classList.toggle("hidden", !hasActive);

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
      // Auto-default start side radio to match last completed thread's last edge load
      const threads = state.threads;
      if (threads.length > 0) {
        const lastThread = threads[threads.length - 1];
        if (lastThread.edges.length > 0) {
          const lastLoad = lastThread.edges[lastThread.edges.length - 1].load;
          radioPositive.input.checked = lastLoad === "positive";
          radioNegative.input.checked = lastLoad === "negative";
        }
      }
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
    if (!active || !active.startPoint) {
      clearPreview();
      return;
    }

    const coord = screenToSvg(svg, e);
    const gridState = gridModel.getState();
    const sizes = computeScaleSizes(gridState.spine);
    const from = getCurrentPoint(active)!;

    chainEligibleHoles = getEligibleChainHoles(active, state.threads);
    anchorLoopEligiblePoints = getEligibleAnchorLoopChainPoints(active, state.threads);

    const target = resolveTarget(svg, coord, gridState);
    if (target.kind === "hole" && target.stationX !== undefined && target.holeY !== undefined) {
      const to: Point = { x: target.stationX, y: target.holeY };
      if (to.x !== from.x || to.y !== from.y) {
        previewEdge = { from, to, load: active.nextLoad };
      } else {
        previewEdge = null;
      }
    } else {
      previewEdge = null;
    }

    renderSewing(svg, sewingModel.getState(), sizes, gridState.spine, previewEdge, { anchorLoopEligiblePoints }, chainEligibleHoles);
  }

  function onMouseLeave() {
    previewEdge = null;
    chainEligibleHoles = [];
    const gridState = gridModel.getState();
    const sizes = computeScaleSizes(gridState.spine);
    renderSewing(svg, sewingModel.getState(), sizes, gridState.spine, null, {}, []);
  }

  function onClick(e: MouseEvent) {
    threadError.textContent = "";
    const state = sewingModel.getState();
    const active = state.activeThread;

    // Alt+click creates anchor loop at the current thread position, regardless of where the user clicked.
    // Must be checked before resolveTarget so alt+clicking anywhere on the SVG works.
    if (e.altKey) {
      if (active?.startPoint) {
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
    if (target.kind !== "hole" || target.stationX === undefined || target.holeY === undefined) return;
    const p: Point = { x: target.stationX, y: target.holeY };

    try {
      if (e.shiftKey) {
        if (active) {
          // Delete last chain stitch or edge if shift+clicking the current endpoint
          const currentPoint = getCurrentPoint(active);
          if (currentPoint && p.x === currentPoint.x && p.y === currentPoint.y) {
            const css = active.chainStitches;
            const lastCS = css.length > 0 ? css[css.length - 1] : null;
            if (lastCS && lastCS.afterEdge === active.edges.length) {
              sewingModel.removeLastChainStitch();
            } else if (active.edges.length > 0) {
              sewingModel.removeLastEdge();
            }
            updateThreadButtons();
            refresh();
          }
        } else {
          // Un-complete the most recently completed thread ending at this point
          const threads = state.threads;
          for (let i = threads.length - 1; i >= 0; i--) {
            const t = threads[i];
            const lastPt = t.edges.length > 0 ? t.edges[t.edges.length - 1].to : t.startPoint;
            if (lastPt.x === p.x && lastPt.y === p.y) {
              sewingModel.uncompleteThread(i);
              updateThreadButtons();
              refresh();
              break;
            }
          }
        }
        return;
      }

      // Ctrl/Cmd+Click: chain stitch at an eligible hole or anchor loop
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (!active?.startPoint) return;
        const from = getCurrentPoint(active);
        if (!from || (p.x === from.x && p.y === from.y)) return;
        const eligible = getEligibleChainHoles(active, state.threads);
        const eligibleAnchorLoops = getEligibleAnchorLoopChainPoints(active, state.threads);
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

      if (!active.startPoint) {
        sewingModel.setThreadStartPoint(p);
      } else {
        const from = getCurrentPoint(active);
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
