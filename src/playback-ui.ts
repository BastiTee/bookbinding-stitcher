import type { GridModel } from "./model";
import type { SewingModel } from "./sewing-model";
import type { SewingState, Thread, Edge } from "./sewing-model";
import { renderSewing } from "./sewing-render";
import { computeScaleSizes } from "./render";
import { el, sectionTitle } from "./dom-utils";

export function buildPlaybackPanel(
  sidebar: HTMLElement,
  sewingModel: SewingModel,
  gridModel: GridModel,
  svg: SVGSVGElement,
): { activate: () => void; deactivate: () => void } {
  const panel = el("div", "playback-panel hidden");
  sidebar.appendChild(panel);

  panel.appendChild(sectionTitle("Playback"));

  const stepLabel = el("div", "playback-step-label");
  panel.appendChild(stepLabel);

  const btnRow = el("div", "playback-btn-row");
  const startBtn = btn("⏮ Start", () => setStep(0));
  const prevBtn = btn("← Back", () => setStep(currentStep - 1));
  const nextBtn = btn("Next →", () => setStep(currentStep + 1));
  btnRow.appendChild(startBtn);
  btnRow.appendChild(prevBtn);
  btnRow.appendChild(nextBtn);
  panel.appendChild(btnRow);

  let spineOnly = false;
  const viewBtn = btn("View: Front & Back", () => {
    spineOnly = !spineOnly;
    viewBtn.textContent = spineOnly ? "View: Spine Only" : "View: Front & Back";
    viewBtn.classList.toggle("active", spineOnly);
    renderStep();
  });
  viewBtn.className = "playback-view-btn";
  panel.appendChild(viewBtn);

  let currentStep = 0; // 0 = show nothing; max = all edges

  function totalEdges(): number {
    return sewingModel.getState().threads.reduce((s, t) => s + t.edges.length, 0);
  }

  function setStep(n: number) {
    const max = totalEdges();
    currentStep = Math.max(0, Math.min(max, n));
    renderStep();
  }

  function renderStep() {
    const sewingState = sewingModel.getState();
    const max = totalEdges();

    // Label
    stepLabel.textContent = `Step ${currentStep} / ${max}`;

    // Button states
    startBtn.disabled = currentStep <= 0;
    prevBtn.disabled = currentStep <= 0;
    nextBtn.disabled = currentStep >= max;

    // Build a sliced SewingState showing only the first `currentStep` edges
    const sliced = sliceState(sewingState, currentStep);

    const gridState = gridModel.getState();
    const sizes = computeScaleSizes(gridState.spine);
    renderSewing(svg, sliced, sizes, gridState.spine, null, { spineOnly });
  }

  function activate() {
    // Start at the last step (all edges visible) so it is immediately usable
    currentStep = totalEdges();
    panel.classList.remove("hidden");
    renderStep();
  }

  function deactivate() {
    panel.classList.add("hidden");
    spineOnly = false;
    viewBtn.textContent = "View: Front & Back";
    viewBtn.classList.remove("active");
  }

  return { activate, deactivate };
}

/**
 * Returns a SewingState containing only the first `count` edges across all threads.
 * Threads with zero remaining edges are omitted entirely so markers don't float.
 */
function sliceState(state: Readonly<SewingState>, count: number): SewingState {
  const threads: Thread[] = [];
  let remaining = count;

  for (const thread of state.threads) {
    if (remaining <= 0) break;
    const take = Math.min(thread.edges.length, remaining);
    const slicedEdges: Edge[] = thread.edges.slice(0, take);
    threads.push({
      startSide: thread.startSide,
      startPoint: thread.startPoint,
      edges: slicedEdges,
      completed: take === thread.edges.length,
      endType: take === thread.edges.length ? thread.endType : undefined,
      anchorLoops: (thread.anchorLoops ?? []).filter(loop => (loop.afterEdge ?? 0) <= take),
      chainStitches: (thread.chainStitches ?? []).filter(cs => cs.afterEdge <= take),
    });
    remaining -= take;
  }

  return { threads, activeThread: null };
}

// --- Helpers ---

function btn(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
