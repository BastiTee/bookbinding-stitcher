import type { GridModel } from "./model";
import type { SewingModel } from "./sewing-model";
import type { SewingState, Thread, Hole } from "./sewing-model";
import { renderSewing } from "./sewing-render";
import { computeScaleSizes } from "./render";
import { el, button } from "./dom-utils";

interface PlaybackStep {
  label: string;
  activeThreadIdx: number; // 0-based index into completedThreads
  edgeCount: number;
  alMax: number;           // include anchor loops with afterEdge <= alMax (-1 = none)
  csMax: number;           // include chain stitches with afterEdge <= csMax (-1 = none)
  hlsMax: number;          // include hidden link stitches with afterEdge <= hlsMax (-1 = none)
  showActiveEnd: boolean;
}

export function buildPlaybackPanel(
  sidebar: HTMLElement,
  sewingModel: SewingModel,
  gridModel: GridModel,
  svg: SVGSVGElement,
): { activate: () => void; deactivate: () => void; setSpineOnly: (enabled: boolean) => void } {
  const panel = el("div", "playback-panel hidden");
  sidebar.appendChild(panel);

  const stepLabel = el("div", "playback-step-label");
  const stepLabelMain = el("span", "playback-step-main");
  const stepLabelCount = el("span", "playback-step-count");
  stepLabel.appendChild(stepLabelMain);
  stepLabel.appendChild(stepLabelCount);
  panel.appendChild(stepLabel);

  const rowStartEnd = el("div", "playback-btn-row");
  const startBtn = button("⏮ Begin", () => setStep(0));
  const endBtn = button("End ⏭", () => setStep(steps.length));
  rowStartEnd.appendChild(startBtn);
  rowStartEnd.appendChild(endBtn);
  panel.appendChild(rowStartEnd);

  const rowBackNext = el("div", "playback-btn-row");
  const prevBtn = button("← Back", () => setStep(currentStepIdx - 1));
  const nextBtn = button("Next →", () => setStep(currentStepIdx + 1));
  rowBackNext.appendChild(prevBtn);
  rowBackNext.appendChild(nextBtn);
  panel.appendChild(rowBackNext);

  let spineOnly = false;
  const viewBtn = button("View: Front & Back", () => {
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
    endBtn.disabled = currentStepIdx >= max;
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
  }

  function deactivate() {
    panel.classList.add("hidden");
    spineOnly = false;
    viewBtn.textContent = "View: Front & Back";
    viewBtn.classList.remove("active");
  }

  function setSpineOnly(enabled: boolean) {
    spineOnly = enabled;
    viewBtn.textContent = enabled ? "View: Spine Only" : "View: Front & Back";
    viewBtn.classList.toggle("active", enabled);
    if (!panel.classList.contains("hidden")) renderStep();
  }

  return { activate, deactivate, setSpineOnly };
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

    const hlsByAfterEdge = new Map<number, number>();
    for (const hls of thread.hiddenLinkStitches ?? []) {
      hlsByAfterEdge.set(hls.afterEdge, (hlsByAfterEdge.get(hls.afterEdge) ?? 0) + 1);
    }

    steps.push({
      label: `Thread ${n} · Start`,
      activeThreadIdx: i,
      edgeCount: 0,
      alMax: -1,
      csMax: -1,
      hlsMax: -1,
      showActiveEnd: false,
    });

    let alMaxSoFar = -1;
    let csMaxSoFar = -1;
    let hlsMaxSoFar = -1;
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
          hlsMax: hlsMaxSoFar,
          showActiveEnd: false,
        });
      }

      if (hlsByAfterEdge.has(j)) {
        hlsMaxSoFar = j;
        stitchCount++;
        steps.push({
          label: `Thread ${n} · Hidden Link`,
          activeThreadIdx: i,
          edgeCount: j,
          alMax: alMaxSoFar,
          csMax: csMaxSoFar,
          hlsMax: j,
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
          hlsMax: hlsMaxSoFar,
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
          hlsMax: hlsMaxSoFar,
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
        hlsMax: hlsMaxSoFar,
        showActiveEnd: false,
      });
    }

    if (hlsByAfterEdge.has(thread.edges.length)) {
      hlsMaxSoFar = thread.edges.length;
      stitchCount++;
      steps.push({
        label: `Thread ${n} · Hidden Link`,
        activeThreadIdx: i,
        edgeCount: thread.edges.length,
        alMax: alMaxSoFar,
        csMax: csMaxSoFar,
        hlsMax: thread.edges.length,
        showActiveEnd: false,
      });
    }

    steps.push({
      label: `Thread ${n} · End`,
      activeThreadIdx: i,
      edgeCount: thread.edges.length,
      alMax: thread.edges.length,
      csMax: thread.edges.length,
      hlsMax: thread.edges.length,
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
        hiddenLinkStitches: (thread.hiddenLinkStitches ?? []).filter(hls => hls.afterEdge <= step.hlsMax),
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
        hiddenLinkStitches: thread.hiddenLinkStitches ?? [],
      });
    }
  }

  return { threads, activeThread: null };
}
