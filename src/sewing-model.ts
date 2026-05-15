import { type Hole, holeEq } from "./model";

export type Load = "positive" | "negative";
export type { Hole };

export interface Edge {
  load: Load;
  from: Hole;
  to: Hole;
  index?: number;
}

export interface AnchorLoop {
  hole: Hole;
  side: Load;
  afterEdge?: number; // edge count at time of creation; used for playback ordering
}

export interface ChainStitch {
  hole: Hole;        // the hole being chained around
  side: Load;        // == nextLoad at time of creation
  afterEdge: number; // active.edges.length at time of creation; used for playback ordering
}

export interface HiddenLinkStitch {
  from: Hole;           // current hole at time of creation
  to: Hole;             // target hole (user-selected)
  side: Load;           // output load after the link: "negative" = type 1 (ends inside), "positive" = type 2 (continues outside)
  afterEdge: number;    // edges.length at creation; used for playback ordering
  pending?: boolean;    // playback only: origin edge is visible but dashed link not yet shown
}

export interface Thread {
  startSide: Load;
  startHole: Hole;
  edges: Edge[];
  completed: boolean;
  endType?: "loose" | "knot";
  anchorLoops: AnchorLoop[];
  chainStitches: ChainStitch[];
  hiddenLinkStitches: HiddenLinkStitch[];
}

export interface ActiveThread {
  startSide: Load;
  startHole: Hole | null;
  edges: Edge[];
  nextLoad: Load;
  anchorLoops: AnchorLoop[];
  chainStitches: ChainStitch[];
  hiddenLinkStitches: HiddenLinkStitch[];
}

export interface SewingState {
  threads: Thread[];
  activeThread: ActiveThread | null;
}

export function getCurrentHole(active: {
  startHole: Hole | null;
  edges: { to: Hole }[];
  chainStitches?: { hole: Hole; afterEdge: number }[];
  hiddenLinkStitches?: { to: Hole; afterEdge: number }[];
}): Hole | null {
  if (!active.startHole) return null;
  const edgeCount = active.edges.length;
  const css = active.chainStitches ?? [];
  const hlss = active.hiddenLinkStitches ?? [];
  const lastCS = css.length > 0 ? css[css.length - 1] : null;
  const lastHLS = hlss.length > 0 ? hlss[hlss.length - 1] : null;
  if (lastCS && lastCS.afterEdge === edgeCount) return lastCS.hole;
  if (lastHLS && lastHLS.afterEdge === edgeCount) return lastHLS.to;
  if (edgeCount === 0) return active.startHole;
  return active.edges[edgeCount - 1].to;
}

function toggleLoad(load: Load): Load {
  return load === "positive" ? "negative" : "positive";
}

export function canEndWithKnot(
  active: ActiveThread,
  threads: readonly Thread[],
): boolean {
  if (!active.startHole || active.edges.length === 0) return false;
  const currentHole = getCurrentHole(active)!;
  const currentLoad = active.nextLoad;

  // Own start hole
  if (holeEq(currentHole, active.startHole) && currentLoad === active.startSide) return true;

  // All completed threads: start hole + every edge endpoint with matching load
  for (const thread of threads) {
    if (holeEq(currentHole, thread.startHole) && currentLoad === thread.startSide) return true;
    for (const edge of thread.edges) {
      if (edge.load === currentLoad &&
          (holeEq(currentHole, edge.from) || holeEq(currentHole, edge.to))) return true;
    }
  }

  // Active thread's own earlier edges (all except the last)
  for (let i = 0; i < active.edges.length - 1; i++) {
    const edge = active.edges[i];
    if (edge.load === currentLoad &&
        (holeEq(currentHole, edge.from) || holeEq(currentHole, edge.to))) return true;
  }

  return false;
}

/**
 * Returns all holes eligible for a chain stitch from the current active thread position.
 * A hole is eligible if any existing thread (completed or active) has an edge or chain stitch
 * on the same load side as nextLoad passing through that hole.
 * The current thread position itself is excluded (no self-chain).
 */
export function getEligibleChainHoles(
  active: ActiveThread,
  threads: readonly Thread[],
): Hole[] {
  if (!active.startHole) return [];

  const currentPos = getCurrentHole(active);
  const load = active.nextLoad;
  const seen = new Set<string>();
  const result: Hole[] = [];

  function add(h: Hole) {
    if (currentPos && h.x === currentPos.x && h.y === currentPos.y) return;
    const key = `${h.x},${h.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(h);
  }

  for (const thread of threads) {
    for (const edge of thread.edges) {
      if (edge.load === load) {
        add(edge.from);
        add(edge.to);
      }
    }
    for (const cs of thread.chainStitches ?? []) {
      if (cs.side === load) add(cs.hole);
    }
  }

  // Also scan active thread's own edges and chain stitches
  for (const edge of active.edges) {
    if (edge.load === load) {
      add(edge.from);
      add(edge.to);
    }
  }
  for (const cs of active.chainStitches) {
    if (cs.side === load) add(cs.hole);
  }

  return result;
}

export function canAddAnchorLoop(active: ActiveThread, threads: readonly Thread[]): boolean {
  if (!active.startHole) return false;
  const currentHole = getCurrentHole(active)!;
  const side = active.nextLoad;
  for (const al of active.anchorLoops) {
    if (holeEq(al.hole, currentHole) && al.side === side) return false;
  }
  for (const thread of threads) {
    for (const al of thread.anchorLoops) {
      if (holeEq(al.hole, currentHole) && al.side === side) return false;
    }
  }
  return true;
}

/**
 * Returns anchor loop holes eligible as chain stitch targets from the current active thread position.
 * A loop is eligible if its side matches nextLoad and it is not at the current thread position.
 */
export function getEligibleAnchorLoopHoles(
  active: ActiveThread,
  threads: readonly Thread[],
): Hole[] {
  if (!active.startHole) return [];
  const currentPos = getCurrentHole(active);
  const load = active.nextLoad;
  const seen = new Set<string>();
  const result: Hole[] = [];

  function add(h: Hole) {
    if (currentPos && h.x === currentPos.x && h.y === currentPos.y) return;
    const key = `${h.x},${h.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ ...h });
  }

  for (const al of active.anchorLoops) {
    if (al.side === load) add(al.hole);
  }
  for (const thread of threads) {
    for (const al of thread.anchorLoops) {
      if (al.side === load) add(al.hole);
    }
  }
  return result;
}

/**
 * Returns holes eligible for a hidden link stitch (all grid holes except the current position).
 * Only valid when nextLoad is "positive" (hidden link replaces an outside pass).
 */
export function getEligibleHiddenLinkHoles(
  active: ActiveThread,
  allHoles: Hole[],
): Hole[] {
  if (!active.startHole || active.nextLoad !== "positive") return [];
  const currentPos = getCurrentHole(active);
  return allHoles.filter(h =>
    !currentPos || h.x !== currentPos.x || h.y !== currentPos.y
  );
}

type Listener = () => void;

export class SewingModel {
  private state: SewingState = { threads: [], activeThread: null };
  private listeners: Listener[] = [];
  private history: SewingState[] = [];
  private future: SewingState[] = [];
  private readonly MAX_HISTORY = 50;

  getState(): Readonly<SewingState> {
    return this.state;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  private snapshot(): SewingState {
    return JSON.parse(JSON.stringify(this.state));
  }

  private saveHistory() {
    this.history.push(this.snapshot());
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }
    this.future = [];
  }

  undo() {
    if (this.history.length === 0) return;
    this.future.push(this.snapshot());
    this.state = this.history.pop()!;
    this.notify();
  }

  redo() {
    if (this.future.length === 0) return;
    this.history.push(this.snapshot());
    this.state = this.future.pop()!;
    this.notify();
  }

  beginThread(startSide: Load) {
    this.saveHistory();
    this.state = {
      ...this.state,
      activeThread: {
        startSide,
        startHole: null,
        edges: [],
        nextLoad: toggleLoad(startSide),
        anchorLoops: [],
        chainStitches: [],
        hiddenLinkStitches: [],
      },
    };
    this.notify();
  }

  setThreadStartPoint(h: Hole) {
    const active = this.state.activeThread;
    if (!active) throw new Error("No active thread");
    if (active.edges.length > 0) throw new Error("Thread already has edges; cannot change start point");
    this.saveHistory();
    this.state = {
      ...this.state,
      activeThread: { ...active, startHole: { ...h } },
    };
    this.notify();
  }

  addEdge(to: Hole) {
    const active = this.state.activeThread;
    if (!active) throw new Error("No active thread");
    if (!active.startHole) throw new Error("Thread start point not set yet");

    const from: Hole = { ...getCurrentHole(active)! };

    const newEdge: Edge = {
      load: active.nextLoad,
      from,
      to: { ...to },
      index: active.edges.length + 1,
    };

    const nextLoad: Load = toggleLoad(active.nextLoad);

    this.saveHistory();
    this.state = {
      ...this.state,
      activeThread: {
        ...active,
        edges: [...active.edges, newEdge],
        nextLoad,
      },
    };
    this.notify();
  }

  endThread() {
    const active = this.state.activeThread;
    if (!active) throw new Error("No active thread");
    if (!active.startHole) throw new Error("Thread has no start point");
    if (active.edges.length < 1) throw new Error("Thread must have at least one edge");

    const completed: Thread = {
      startSide: active.startSide,
      startHole: active.startHole,
      edges: active.edges,
      completed: true,
      anchorLoops: active.anchorLoops,
      chainStitches: active.chainStitches,
      hiddenLinkStitches: active.hiddenLinkStitches,
    };

    this.saveHistory();
    this.state = {
      threads: [...this.state.threads, completed],
      activeThread: null,
    };
    this.notify();
  }

  endThreadWithKnot() {
    const active = this.state.activeThread;
    if (!active) throw new Error("No active thread");
    if (!active.startHole) throw new Error("Thread has no start point");
    if (active.edges.length < 1) throw new Error("Thread must have at least one edge");
    if (!canEndWithKnot(active, this.state.threads))
      throw new Error("Cannot end with knot: no matching thread pass at current position");

    const completed: Thread = {
      startSide: active.startSide,
      startHole: active.startHole,
      edges: active.edges,
      completed: true,
      endType: "knot",
      anchorLoops: active.anchorLoops,
      chainStitches: active.chainStitches,
      hiddenLinkStitches: active.hiddenLinkStitches,
    };
    this.saveHistory();
    this.state = { threads: [...this.state.threads, completed], activeThread: null };
    this.notify();
  }

  removeLastEdge() {
    const active = this.state.activeThread;
    if (!active) throw new Error("No active thread");
    if (active.edges.length === 0) throw new Error("Thread has no edges to remove");

    // Guard: if the last action was a chain stitch or hidden link stitch, it must be removed first
    const css = active.chainStitches;
    if (css.length > 0 && css[css.length - 1].afterEdge === active.edges.length) {
      throw new Error("Last action was a chain stitch; remove it first (Shift+Click current point)");
    }
    const hlss = active.hiddenLinkStitches;
    if (hlss.length > 0 && hlss[hlss.length - 1].afterEdge === active.edges.length) {
      throw new Error("Last action was a hidden link stitch; remove it first (Shift+Click current point)");
    }

    const newEdges = active.edges.slice(0, -1);
    const nextLoad: Load = toggleLoad(active.nextLoad);

    this.saveHistory();
    this.state = {
      ...this.state,
      activeThread: { ...active, edges: newEdges, nextLoad },
    };
    this.notify();
  }

  addAnchorLoop() {
    const active = this.state.activeThread;
    if (!active) throw new Error("No active thread");
    if (!active.startHole) throw new Error("Thread start point not set");
    if (!canAddAnchorLoop(active, this.state.threads)) throw new Error("Anchor loop already exists at this hole and side");

    const currentHole: Hole = { ...getCurrentHole(active)! };

    // The loop is made on the side you dip into (= nextLoad).
    // After dipping and returning, nextLoad flips back so the next edge continues on the same side.
    const loop: AnchorLoop = {
      hole: currentHole,
      side: active.nextLoad,
      afterEdge: active.edges.length,
    };

    const nextLoad: Load = toggleLoad(active.nextLoad);

    this.saveHistory();
    this.state = {
      ...this.state,
      activeThread: { ...active, anchorLoops: [...active.anchorLoops, loop], nextLoad },
    };
    this.notify();
  }

  addChainStitch(to: Hole) {
    const active = this.state.activeThread;
    if (!active || !active.startHole) throw new Error("No active thread with start point");

    const cs: ChainStitch = {
      hole: { ...to },
      side: active.nextLoad,
      afterEdge: active.edges.length,
    };

    // nextLoad intentionally NOT toggled — chain stitch stays on the same side
    this.saveHistory();
    this.state = {
      ...this.state,
      activeThread: {
        ...active,
        chainStitches: [...active.chainStitches, cs],
      },
    };
    this.notify();
  }

  removeLastChainStitch() {
    const active = this.state.activeThread;
    if (!active) throw new Error("No active thread");
    const css = active.chainStitches;
    if (css.length === 0 || css[css.length - 1].afterEdge !== active.edges.length) {
      throw new Error("Last action was not a chain stitch");
    }
    this.saveHistory();
    this.state = {
      ...this.state,
      activeThread: { ...active, chainStitches: css.slice(0, -1) },
    };
    this.notify();
  }

  addHiddenLinkStitch(to: Hole, kind: Load) {
    const active = this.state.activeThread;
    if (!active || !active.startHole) throw new Error("No active thread with start point");
    if (active.nextLoad !== "positive") throw new Error("Hidden link stitch can only replace an outside (positive) pass");

    const from = getCurrentHole(active)!;
    if (from.x === to.x && from.y === to.y) throw new Error("Cannot link a hole to itself");

    // Guard: cannot add hidden link stitch if there's already a chain stitch at this afterEdge
    const css = active.chainStitches;
    if (css.length > 0 && css[css.length - 1].afterEdge === active.edges.length) {
      throw new Error("Cannot add hidden link stitch: remove the chain stitch first");
    }

    const hls: HiddenLinkStitch = {
      from: { ...from },
      to: { ...to },
      side: kind,
      afterEdge: active.edges.length,
    };

    // Type 1 (kind="negative"): flips nextLoad positive→negative
    // Type 2 (kind="positive"): nextLoad stays positive (no toggle)
    const nextLoad: Load = kind === "negative" ? toggleLoad(active.nextLoad) : active.nextLoad;

    this.saveHistory();
    this.state = {
      ...this.state,
      activeThread: {
        ...active,
        hiddenLinkStitches: [...active.hiddenLinkStitches, hls],
        nextLoad,
      },
    };
    this.notify();
  }

  removeLastHiddenLinkStitch() {
    const active = this.state.activeThread;
    if (!active) throw new Error("No active thread");
    const hlss = active.hiddenLinkStitches;
    if (hlss.length === 0 || hlss[hlss.length - 1].afterEdge !== active.edges.length) {
      throw new Error("Last action was not a hidden link stitch");
    }
    const lastHLS = hlss[hlss.length - 1];
    // Type 1 (side="negative"): undo the positive→negative toggle (goes back to positive)
    // Type 2 (side="positive"): nextLoad was unchanged, so undo is also a no-op
    const nextLoad: Load = lastHLS.side === "negative" ? toggleLoad(active.nextLoad) : active.nextLoad;
    this.saveHistory();
    this.state = {
      ...this.state,
      activeThread: {
        ...active,
        hiddenLinkStitches: hlss.slice(0, -1),
        nextLoad,
      },
    };
    this.notify();
  }

  uncompleteThread(threadIndex: number) {
    const threads = this.state.threads;
    if (threadIndex < 0 || threadIndex >= threads.length) throw new Error("Invalid thread index");
    if (this.state.activeThread) throw new Error("Cannot un-complete thread while another is active");
    const thread = threads[threadIndex];

    let nextLoad: Load = toggleLoad(
      thread.edges.length > 0 ? thread.edges[thread.edges.length - 1].load : thread.startSide
    );
    const hlss = thread.hiddenLinkStitches ?? [];
    const finalHLS = hlss.length > 0 ? hlss[hlss.length - 1] : null;
    if (finalHLS && finalHLS.afterEdge === thread.edges.length) nextLoad = finalHLS.side;

    const active: ActiveThread = {
      startSide: thread.startSide,
      startHole: thread.startHole,
      edges: thread.edges,
      nextLoad,
      anchorLoops: thread.anchorLoops ?? [],
      chainStitches: thread.chainStitches ?? [],
      hiddenLinkStitches: thread.hiddenLinkStitches ?? [],
    };

    this.saveHistory();
    this.state = {
      threads: threads.filter((_, i) => i !== threadIndex),
      activeThread: active,
    };
    this.notify();
  }

  cancelThread() {
    this.saveHistory();
    this.state = { ...this.state, activeThread: null };
    this.notify();
  }

  reset() {
    this.history = [];
    this.future = [];
    this.state = { threads: [], activeThread: null };
    this.notify();
  }

  /**
   * Converts the sewing state to the JSON export format.
   * Chain stitches are merged into their corresponding edges as `chainedVia`.
   */
  exportThreads(): object[] {
    return this.state.threads.map(t => {
      const lastEdge = t.edges.length > 0 ? t.edges[t.edges.length - 1] : null;
      const lastLoad = lastEdge ? lastEdge.load : t.startSide;
      const sortedCS = [...(t.chainStitches ?? [])].sort((a, b) => a.afterEdge - b.afterEdge);
      let csIdx = 0;
      const exportEdges = t.edges.map((edge, i) => {
        if (csIdx < sortedCS.length && sortedCS[csIdx].afterEdge === i) {
          const cs = sortedCS[csIdx++];
          const prevTo = i > 0 ? t.edges[i - 1].to : t.startHole;
          return { ...edge, from: prevTo, chainedVia: cs.hole };
        }
        return edge;
      });
      return {
        threadStart: { side: t.startSide, hole: t.startHole },
        threadEnd: {
          type: t.endType ?? "loose",
          side: lastLoad === "positive" ? "negative" : "positive",
          hole: lastEdge ? lastEdge.to : t.startHole,
        },
        edges: exportEdges,
        anchorLoops: (t.anchorLoops ?? []).map(al => ({ hole: al.hole, side: al.side, afterEdge: al.afterEdge })),
        hiddenLinkStitches: (t.hiddenLinkStitches ?? []).map(hls => ({ from: hls.from, to: hls.to, side: hls.side, afterEdge: hls.afterEdge })),
      };
    });
  }

  /**
   * Loads threads from the JSON import format, normalizing chainedVia edges back to chainStitches[].
   */
  importThreads(rawThreads: Array<{
    threadStart: { side: unknown; hole: unknown };
    threadEnd?: { type?: unknown };
    edges: Array<Record<string, unknown>>;
    anchorLoops?: unknown[];
    hiddenLinkStitches?: unknown[];
  }>) {
    const chainStitches: Array<Record<string, unknown>> = [];
    const threads: Thread[] = rawThreads.map((t) => {
      const localCS: Array<Record<string, unknown>> = [];
      const normalizedEdges = (t.edges ?? []).map((e, i) => {
        if (e.chainedVia != null) {
          localCS.push({ hole: e.chainedVia, side: e.load, afterEdge: i });
          const { chainedVia, ...rest } = e;
          return { ...rest, from: chainedVia };
        }
        return e;
      });
      const anchorLoops = (t.anchorLoops ?? []).map((al: any) => ({
        hole: al.hole,
        side: al.side,
        afterEdge: al.afterEdge,
      }));
      const hiddenLinkStitches = (t.hiddenLinkStitches ?? []).map((hls: any) => ({
        from: hls.from,
        to: hls.to,
        side: hls.side,
        afterEdge: hls.afterEdge,
      }));
      chainStitches.push(...localCS);
      return {
        startSide: t.threadStart?.side,
        startHole: t.threadStart?.hole,
        edges: normalizedEdges,
        completed: true,
        endType: t.threadEnd?.type === "knot" ? "knot" : "loose",
        anchorLoops,
        chainStitches: localCS,
        hiddenLinkStitches,
      } as unknown as Thread;
    });
    this.loadThreads(threads);
  }

  loadThreads(threads: Thread[]) {
    // Validate input
    for (const t of threads) {
      if (t.startSide !== "positive" && t.startSide !== "negative") {
        throw new Error(`Invalid startSide: ${t.startSide}`);
      }
      if (typeof t.startHole?.x !== "number" || typeof t.startHole?.y !== "number") {
        throw new Error("Thread startHole must have numeric x and y");
      }
      if (!Array.isArray(t.edges)) {
        throw new Error("Thread edges must be an array");
      }
      for (const e of t.edges) {
        if (e.load !== "positive" && e.load !== "negative") {
          throw new Error(`Invalid edge load: ${e.load}`);
        }
        if (typeof e.from?.x !== "number" || typeof e.from?.y !== "number" ||
            typeof e.to?.x !== "number" || typeof e.to?.y !== "number") {
          throw new Error("Edge from/to must have numeric x and y");
        }
      }
      for (const cs of t.chainStitches ?? []) {
        if (cs.side !== "positive" && cs.side !== "negative") {
          throw new Error(`Invalid chain stitch side: ${cs.side}`);
        }
        if (typeof cs.hole?.x !== "number" || typeof cs.hole?.y !== "number") {
          throw new Error("Chain stitch hole must have numeric x and y");
        }
        if (typeof cs.afterEdge !== "number" || cs.afterEdge < 0) {
          throw new Error("Chain stitch afterEdge must be a non-negative number");
        }
      }
      for (const hls of t.hiddenLinkStitches ?? []) {
        if (hls.side !== "positive" && hls.side !== "negative") {
          throw new Error(`Invalid hidden link stitch side: ${hls.side}`);
        }
        if (typeof hls.from?.x !== "number" || typeof hls.from?.y !== "number" ||
            typeof hls.to?.x !== "number" || typeof hls.to?.y !== "number") {
          throw new Error("Hidden link stitch from/to must have numeric x and y");
        }
        if (typeof hls.afterEdge !== "number" || hls.afterEdge < 0) {
          throw new Error("Hidden link stitch afterEdge must be a non-negative number");
        }
      }
    }
    this.history = [];
    this.future = [];
    this.state = {
      threads: threads.map(t => ({
        ...t,
        completed: true,
        endType: t.endType ?? "loose",
        anchorLoops: t.anchorLoops ?? [],
        chainStitches: t.chainStitches ?? [],
        hiddenLinkStitches: t.hiddenLinkStitches ?? [],
        edges: t.edges.map((e, i) => ({ ...e, index: e.index ?? i + 1 })),
      })),
      activeThread: null,
    };
    this.notify();
  }
}
