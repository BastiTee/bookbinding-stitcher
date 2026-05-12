import type { GridModel } from "./model";
import type { SewingModel } from "./sewing-model";
import type { SewingState, Thread, Hole } from "./sewing-model";
import { renderSewing } from "./sewing-render";
import { computeScaleSizes } from "./render";
import { el } from "./dom-utils";

interface PlaybackStep {
  label: string;
  activeThreadIdx: number; // 0-based index into completedThreads
  edgeCount: number;
  alMax: number;           // include anchor loops with afterEdge <= alMax (-1 = none)
  csMax: number;           // include chain stitches with afterEdge <= csMax (-1 = none)
  showActiveEnd: boolean;
}

export function buildPlaybackPanel(
  sidebar: HTMLElement,
  sewingModel: SewingModel,
  gridModel: GridModel,
  svg: SVGSVGElement,
): { activate: () => void; deactivate: () => void } {
  const panel = el("div", "playback-panel hidden");
  sidebar.appendChild(panel);

  const stepLabel = el("div", "playback-step-label");
  const stepLabelMain = el("span", "playback-step-main");
  const stepLabelCount = el("span", "playback-step-count");
  stepLabel.appendChild(stepLabelMain);
  stepLabel.appendChild(stepLabelCount);
  panel.appendChild(stepLabel);

  const btnRow = el("div", "playback-btn-row");
  const startBtn = btn("⏮ Start", () => setStep(0));
  const prevBtn = btn("← Back", () => setStep(currentStepIdx - 1));
  const nextBtn = btn("Next →", () => setStep(currentStepIdx + 1));
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

  let currentStepIdx = 0;
  let steps: PlaybackStep[] = [];

  function setStep(n: number) {
    currentStepIdx = Math.max(0, Math.min(steps.length, n));
    renderStep();
  }

  function renderStep() {
    const sewingState = sewingModel.getState();
    const max = steps.length;

    if (currentStepIdx === 0) {
      stepLabelMain.textContent = "";
      stepLabelCount.textContent = `0 / ${max}`;
    } else {
      stepLabelMain.textContent = steps[currentStepIdx - 1].label;
      stepLabelCount.textContent = `${currentStepIdx} / ${max}`;
    }

    startBtn.disabled = currentStepIdx <= 0;
    prevBtn.disabled = currentStepIdx <= 0;
    nextBtn.disabled = currentStepIdx >= max;

    const sliced = currentStepIdx === 0
      ? { threads: [], activeThread: null }
      : sliceState(sewingState, steps[currentStepIdx - 1]);

    const gridState = gridModel.getState();
    const sizes = computeScaleSizes(gridState.spine);

    let startTailTargets: Hole[] | undefined;
    if (currentStepIdx > 0 && steps[currentStepIdx - 1].edgeCount === 0) {
      const step = steps[currentStepIdx - 1];
      const completedThreads = sewingState.threads.filter(t => t.completed && t.edges.length > 0);
      const fullThread = completedThreads[step.activeThreadIdx];
      if (fullThread) {
        startTailTargets = [];
        startTailTargets[step.activeThreadIdx] = fullThread.edges[0].to;
      }
    }

    renderSewing(svg, sliced, sizes, gridState.spine, null, { spineOnly, startTailTargets });
  }

  function activate() {
    steps = buildSteps(sewingModel.getState());
    currentStepIdx = steps.length;
    panel.classList.remove("hidden");
    renderStep();
    document.addEventListener("keydown", onKeyDown);
  }

  function deactivate() {
    panel.classList.add("hidden");
    spineOnly = false;
    viewBtn.textContent = "View: Front & Back";
    viewBtn.classList.remove("active");
    document.removeEventListener("keydown", onKeyDown);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        e.shiftKey ? setStep(steps.length) : setStep(currentStepIdx + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        e.shiftKey ? setStep(0) : setStep(currentStepIdx - 1);
        break;
      case "ArrowUp":
      case "ArrowDown":
        e.preventDefault();
        viewBtn.click();
        break;
    }
  }

  return { activate, deactivate };
}

function buildSteps(state: Readonly<SewingState>): PlaybackStep[] {
  const completedThreads = state.threads.filter(t => t.completed && t.edges.length > 0);
  const steps: PlaybackStep[] = [];

  for (let i = 0; i < completedThreads.length; i++) {
    const thread = completedThreads[i];
    const n = i + 1;

    const chainByEdge = new Map(thread.chainStitches.map(cs => [cs.afterEdge, cs]));

    const loopsByAfterEdge = new Map<number, number>();
    for (const loop of thread.anchorLoops ?? []) {
      const key = loop.afterEdge ?? 0;
      loopsByAfterEdge.set(key, (loopsByAfterEdge.get(key) ?? 0) + 1);
    }

    steps.push({
      label: `Thread ${n} · Start`,
      activeThreadIdx: i,
      edgeCount: 0,
      alMax: -1,
      csMax: -1,
      showActiveEnd: false,
    });

    let alMaxSoFar = -1;
    let csMaxSoFar = -1;
    let stitchCount = 0;

    for (let j = 0; j < thread.edges.length; j++) {
      if (loopsByAfterEdge.has(j)) {
        alMaxSoFar = j;
        steps.push({
          label: `Thread ${n} · Anchor Loop`,
          activeThreadIdx: i,
          edgeCount: j,
          alMax: j,
          csMax: csMaxSoFar,
          showActiveEnd: false,
        });
      }

      if (chainByEdge.has(j)) {
        csMaxSoFar = j;
        stitchCount++;
        steps.push({
          label: `Thread ${n} · Chain Stitch`,
          activeThreadIdx: i,
          edgeCount: j + 1,
          alMax: alMaxSoFar,
          csMax: j,
          showActiveEnd: false,
        });
      } else {
        stitchCount++;
        steps.push({
          label: `Thread ${n} · Stitch ${stitchCount}`,
          activeThreadIdx: i,
          edgeCount: j + 1,
          alMax: alMaxSoFar,
          csMax: csMaxSoFar,
          showActiveEnd: false,
        });
      }
    }

    if (loopsByAfterEdge.has(thread.edges.length)) {
      alMaxSoFar = thread.edges.length;
      steps.push({
        label: `Thread ${n} · Anchor Loop`,
        activeThreadIdx: i,
        edgeCount: thread.edges.length,
        alMax: thread.edges.length,
        csMax: csMaxSoFar,
        showActiveEnd: false,
      });
    }

    steps.push({
      label: `Thread ${n} · End`,
      activeThreadIdx: i,
      edgeCount: thread.edges.length,
      alMax: thread.edges.length,
      csMax: thread.edges.length,
      showActiveEnd: true,
    });
  }

  return steps;
}

function sliceState(state: Readonly<SewingState>, step: PlaybackStep): SewingState {
  const completedThreads = state.threads.filter(t => t.completed && t.edges.length > 0);
  const threads: Thread[] = [];

  for (let i = 0; i <= step.activeThreadIdx && i < completedThreads.length; i++) {
    const thread = completedThreads[i];
    const isActive = i === step.activeThreadIdx;

    if (isActive) {
      threads.push({
        startSide: thread.startSide,
        startHole: thread.startHole,
        edges: thread.edges.slice(0, step.edgeCount),
        completed: step.showActiveEnd,
        endType: step.showActiveEnd ? thread.endType : undefined,
        anchorLoops: (thread.anchorLoops ?? []).filter(loop => (loop.afterEdge ?? 0) <= step.alMax),
        chainStitches: (thread.chainStitches ?? []).filter(cs => cs.afterEdge <= step.csMax),
      });
    } else {
      threads.push({
        startSide: thread.startSide,
        startHole: thread.startHole,
        edges: thread.edges,
        completed: true,
        endType: thread.endType,
        anchorLoops: thread.anchorLoops ?? [],
        chainStitches: thread.chainStitches ?? [],
      });
    }
  }

  return { threads, activeThread: null };
}

function btn(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
