import { type GridModel, holeEq } from "./model";
import {
  SewingModel,
  canEndWithKnot,
  canAddAnchorLoop,
  getCurrentHole,
  getEligibleChainHoles,
  getEligibleAnchorLoopHoles,
  getEligibleHiddenLinkHoles,
  type Load,
  type Hole,
} from "./sewing-model";
import { renderSewing, type PreviewEdge } from "./sewing-render";
import { computeScaleSizes } from "./render";
import { screenToSvg, resolveTarget } from "./interaction";
import { el, button } from "./dom-utils";
import { HoverMenu, type MenuItem } from "./hover-menu";

interface PreviewState {
  previewEdge?: PreviewEdge | null;
  previewAnchorLoop?: Hole;
  previewChainStitch?: { from: Hole; to: Hole; side: Load };
  previewHiddenLink?: { from: Hole; to: Hole; side: Load };
}

export function buildSewingPanel(
  sidebar: HTMLElement,
  sewingModel: SewingModel,
  gridModel: GridModel,
  svg: SVGSVGElement,
  svgPanel: HTMLElement,
  refresh: () => void,
): { panel: HTMLElement; activate: () => void; deactivate: () => void } {
  const panel = el("div", "sewing-panel hidden");

  const statusLabel = el("div", "next-edge-label");
  panel.appendChild(statusLabel);

  const undoRedoRow = el("div", "undo-redo-row");
  const undoBtn = button("↩ Undo", () => { sewingModel.undo(); updatePanel(); });
  const redoBtn = button("↪ Redo", () => { sewingModel.redo(); updatePanel(); });
  undoRedoRow.appendChild(undoBtn);
  undoRedoRow.appendChild(redoBtn);
  panel.appendChild(undoRedoRow);

  const cancelBtn = button("Cancel Thread", () => {
    sewingModel.cancelThread();
    clearPreviewState();
    refresh();
    updatePanel();
  }, "cancel-thread-btn");
  cancelBtn.disabled = true;
  panel.appendChild(cancelBtn);

  sidebar.appendChild(panel);

  // --- Hover menu ---
  const menu = new HoverMenu(svgPanel);

  let unsubscribeSewingModel: (() => void) | null = null;

  // --- Preview state (shared between mousemove and menu item hover) ---
  let preview: PreviewState = {};
  let chainEligibleHoles: Hole[] = [];
  let anchorLoopEligibleHoles: Hole[] = [];
  let hiddenLinkEligibleHoles: Hole[] = [];

  function renderWithPreview() {
    const gridState = gridModel.getState();
    const sizes = computeScaleSizes(gridState.spine);
    renderSewing(
      svg,
      sewingModel.getState(),
      sizes,
      gridState.spine,
      preview.previewEdge ?? null,
      {
        anchorLoopEligiblePoints: anchorLoopEligibleHoles,
        previewAnchorLoop: preview.previewAnchorLoop,
        previewChainStitch: preview.previewChainStitch,
        previewHiddenLink: preview.previewHiddenLink,
      },
      chainEligibleHoles,
      hiddenLinkEligibleHoles,
    );
  }

  function clearPreviewState() {
    if (hoverTimeout !== null) { clearTimeout(hoverTimeout); hoverTimeout = null; }
    hoveredHole = null;
    menu.hide();
    preview = {};
    chainEligibleHoles = [];
    anchorLoopEligibleHoles = [];
    hiddenLinkEligibleHoles = [];
  }

  function updatePanel() {
    const state = sewingModel.getState();
    const active = state.activeThread;

    undoBtn.disabled = !sewingModel.canUndo();
    redoBtn.disabled = !sewingModel.canRedo();
    cancelBtn.disabled = !active;

    if (!active) {
      statusLabel.textContent = "";
    } else if (!active.startHole) {
      statusLabel.textContent = "Hover a hole to set start point";
    } else {
      const loadName = active.nextLoad === "positive" ? "outside (positive)" : "inside (negative)";
      statusLabel.textContent = `Next: ${loadName}`;
    }
  }

  // --- Hover state ---
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let hoveredHole: Hole | null = null;

  function onMouseMove(e: MouseEvent) {
    const coord = screenToSvg(svg, e);
    const gridState = gridModel.getState();
    const target = resolveTarget(svg, coord, gridState);

    if (target.kind !== "hole" || target.holeX === undefined || target.holeY === undefined) {
      if (!menu.isHovering()) onHoleLeave();
      return;
    }

    const hole: Hole = { x: target.holeX, y: target.holeY };
    if (hoveredHole && holeEq(hole, hoveredHole)) return;

    // Entering a new hole — cancel old timer, dismiss menu if not hovering it
    if (hoverTimeout !== null) { clearTimeout(hoverTimeout); hoverTimeout = null; }
    if (!menu.isHovering()) menu.hide();
    hoveredHole = hole;

    // Immediate preview feedback
    const state = sewingModel.getState();
    const active = state.activeThread;
    preview = {};
    if (active?.startHole) {
      chainEligibleHoles = getEligibleChainHoles(active, state.threads);
      anchorLoopEligibleHoles = getEligibleAnchorLoopHoles(active, state.threads);
      hiddenLinkEligibleHoles = active.nextLoad === "positive"
        ? getEligibleHiddenLinkHoles(active, gridState.holes)
        : [];
      const from = getCurrentHole(active)!;
      if (!holeEq(hole, from)) {
        preview.previewEdge = { from, to: hole, load: active.nextLoad };
      }
    } else {
      chainEligibleHoles = [];
      anchorLoopEligibleHoles = [];
      hiddenLinkEligibleHoles = [];
    }
    renderWithPreview();

    // Schedule menu after delay
    hoverTimeout = setTimeout(() => {
      hoverTimeout = null;
      const pos = HoverMenu.holeToContainerCoords(svg, svgPanel, hole);
      const items = buildMenuItems(hole);
      if (items.length > 0) menu.show(pos.x, pos.y, items);
    }, 100);
  }

  function onHoleLeave() {
    if (hoverTimeout !== null) { clearTimeout(hoverTimeout); hoverTimeout = null; }
    hoveredHole = null;
    preview = {};
    chainEligibleHoles = [];
    anchorLoopEligibleHoles = [];
    hiddenLinkEligibleHoles = [];
    menu.scheduleDismiss(200);
    renderWithPreview();
  }

  function onMouseLeave() {
    onHoleLeave();
  }

  function onClick(e: MouseEvent) {
    const coord = screenToSvg(svg, e);
    const gridState = gridModel.getState();
    const target = resolveTarget(svg, coord, gridState);
    if (target.kind !== "hole" || target.holeX === undefined || target.holeY === undefined) return;
    const hole: Hole = { x: target.holeX, y: target.holeY };

    const state = sewingModel.getState();
    const active = state.activeThread;
    if (!active) return;

    if (!active.startHole) {
      sewingModel.setThreadStartPoint(hole);
      menu.hide();
      refresh();
      updatePanel();
      return;
    }

    const from = getCurrentHole(active)!;
    if (holeEq(hole, from)) return;

    sewingModel.addEdge(hole);
    menu.hide();
    refresh();
    updatePanel();
  }

  function buildMenuItems(hole: Hole): MenuItem[] {
    const state = sewingModel.getState();
    const active = state.activeThread;
    const items: MenuItem[] = [];

    if (!active) {
      items.push({
        label: "Start from outside the spine",
        icon: "●",
        loadColor: "positive",
        primary: true,
        onClick: () => {
          sewingModel.beginThread("positive");
          sewingModel.setThreadStartPoint(hole);
          clearPreviewState();
          refresh();
          updatePanel();
        },
      });
      items.push({
        label: "Start from inside the spine",
        icon: "●",
        loadColor: "negative",
        onClick: () => {
          sewingModel.beginThread("negative");
          sewingModel.setThreadStartPoint(hole);
          clearPreviewState();
          refresh();
          updatePanel();
        },
      });
      // Re-open completed threads that start or end at this hole
      for (let i = 0; i < state.threads.length; i++) {
        const t = state.threads[i];
        const lastEdge = t.edges[t.edges.length - 1];
        if (holeEq(t.startHole, hole) || (lastEdge && holeEq(lastEdge.to, hole))) {
          const idx = i;
          items.push({
            label: `Re-open thread ${i + 1}`,
            icon: "↩",
            onClick: () => {
              sewingModel.uncompleteThread(idx);
              clearPreviewState();
              refresh();
              updatePanel();
            },
          });
        }
      }
      return items;
    }

    if (!active.startHole) {
      items.push({
        label: "Set as start point",
        icon: "◆",
        primary: true,
        onClick: () => {
          sewingModel.setThreadStartPoint(hole);
          clearPreviewState();
          refresh();
          updatePanel();
        },
      });
      return items;
    }

    const currentHole = getCurrentHole(active)!;
    const isCurrentHole = holeEq(hole, currentHole);

    if (isCurrentHole) {
      if (canAddAnchorLoop(active, state.threads)) {
        items.push({
          label: active.nextLoad === "negative" ? "Add anchor loop (inside)" : "Add anchor loop (outside)",
          icon: "⊂",
          primary: true,
          onHover: () => {
            preview = { previewAnchorLoop: hole };
            renderWithPreview();
          },
          onLeave: () => {
            preview = {};
            renderWithPreview();
          },
          onClick: () => {
            sewingModel.addAnchorLoop();
            clearPreviewState();
            refresh();
            updatePanel();
          },
        });
      }
      if (active.edges.length > 0) {
        items.push({
          label: "End thread — open end",
          icon: "◇",
          onClick: () => {
            sewingModel.endThread();
            clearPreviewState();
            refresh();
            updatePanel();
          },
        });
        if (canEndWithKnot(active, state.threads)) {
          items.push({
            label: "End thread — with knot",
            icon: "✕",
            onClick: () => {
              sewingModel.endThreadWithKnot();
              clearPreviewState();
              refresh();
              updatePanel();
            },
          });
        }
      }
      return items;
    }

    // Different hole: draw-edge and special stitches
    const nextLoad = active.nextLoad;
    const loadLabel = nextLoad === "positive" ? "outside" : "inside";

    items.push({
      label: `Draw edge — ${loadLabel}`,
      icon: "→",
      primary: true,
      onHover: () => {
        preview = { previewEdge: { from: currentHole, to: hole, load: nextLoad } };
        renderWithPreview();
      },
      onLeave: () => {
        preview = {};
        renderWithPreview();
      },
      onClick: () => {
        sewingModel.addEdge(hole);
        clearPreviewState();
        refresh();
        updatePanel();
      },
    });

    // Chain stitch
    const chainElig = getEligibleChainHoles(active, state.threads);
    const anchorLoopElig = getEligibleAnchorLoopHoles(active, state.threads);
    const isChainEligible =
      chainElig.some(h => holeEq(h, hole)) || anchorLoopElig.some(h => holeEq(h, hole));
    if (isChainEligible) {
      items.push({
        label: "Chain stitch here",
        icon: "⊃",
        onHover: () => {
          preview = { previewChainStitch: { from: currentHole, to: hole, side: nextLoad } };
          renderWithPreview();
        },
        onLeave: () => {
          preview = {};
          renderWithPreview();
        },
        onClick: () => {
          sewingModel.addChainStitch(hole);
          clearPreviewState();
          refresh();
          updatePanel();
        },
      });
    }

    // Hidden link stitches (only when nextLoad === "positive")
    if (nextLoad === "positive") {
      items.push({
        label: "Hidden link into spine",
        icon: "⇢",
        loadColor: "negative",
        onHover: () => {
          preview = { previewHiddenLink: { from: currentHole, to: hole, side: "negative" } };
          renderWithPreview();
        },
        onLeave: () => {
          preview = {};
          renderWithPreview();
        },
        onClick: () => {
          sewingModel.addHiddenLinkStitch(hole, "negative");
          clearPreviewState();
          refresh();
          updatePanel();
        },
      });
      items.push({
        label: "Hidden link into signature",
        icon: "⇢",
        loadColor: "positive",
        onHover: () => {
          preview = { previewHiddenLink: { from: currentHole, to: hole, side: "positive" } };
          renderWithPreview();
        },
        onLeave: () => {
          preview = {};
          renderWithPreview();
        },
        onClick: () => {
          sewingModel.addHiddenLinkStitch(hole, "positive");
          clearPreviewState();
          refresh();
          updatePanel();
        },
      });
    }

    return items;
  }

  // --- Keyboard shortcuts (undo/redo only) ---
  function onKeyDown(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === "z" || e.key === "Z") {
      if (e.shiftKey) {
        e.preventDefault();
        sewingModel.redo();
        updatePanel();
      } else {
        e.preventDefault();
        sewingModel.undo();
        updatePanel();
      }
    }
  }

  function activate() {
    panel.classList.remove("hidden");
    svg.addEventListener("mousemove", onMouseMove);
    svg.addEventListener("click", onClick);
    svg.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("keydown", onKeyDown);
    unsubscribeSewingModel = sewingModel.subscribe(updatePanel);
    updatePanel();
  }

  function deactivate() {
    panel.classList.add("hidden");
    svg.removeEventListener("mousemove", onMouseMove);
    svg.removeEventListener("click", onClick);
    svg.removeEventListener("mouseleave", onMouseLeave);
    document.removeEventListener("keydown", onKeyDown);
    unsubscribeSewingModel?.();
    unsubscribeSewingModel = null;
    clearPreviewState();
  }

  return { panel, activate, deactivate };
}
