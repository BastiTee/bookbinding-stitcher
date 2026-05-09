export type Load = "positive" | "negative";

export interface Hole {
  x: number;
  y: number;
}

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

export interface Thread {
  startSide: Load;
  startHole: Hole;
  edges: Edge[];
  completed: boolean;
  endType?: "loose" | "knot";
  anchorLoops: AnchorLoop[];
  chainStitches: ChainStitch[];
}

export interface ActiveThread {
  startSide: Load;
  startHole: Hole | null;
  edges: Edge[];
  nextLoad: Load;
  anchorLoops: AnchorLoop[];
  chainStitches: ChainStitch[];
}

export interface SewingState {
  threads: Thread[];
  activeThread: ActiveThread | null;
}

export function getCurrentHole(active: {
  startHole: Hole | null;
  edges: { to: Hole }[];
  chainStitches?: { hole: Hole; afterEdge: number }[];
}): Hole | null {
  if (!active.startHole) return null;
  const css = active.chainStitches ?? [];
  const lastCS = css.length > 0 ? css[css.length - 1] : null;
  if (lastCS && lastCS.afterEdge === active.edges.length) return lastCS.hole;
  if (active.edges.length === 0) return active.startHole;
  return active.edges[active.edges.length - 1].to;
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
  function holeEq(a: Hole, b: Hole) { return a.x === b.x && a.y === b.y; }

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
    };
    this.saveHistory();
    this.state = { threads: [...this.state.threads, completed], activeThread: null };
    this.notify();
  }

  removeLastEdge() {
    const active = this.state.activeThread;
    if (!active) throw new Error("No active thread");
    if (active.edges.length === 0) throw new Error("Thread has no edges to remove");

    // Guard: if the last action was a chain stitch, it must be removed first
    const css = active.chainStitches;
    if (css.length > 0 && css[css.length - 1].afterEdge === active.edges.length) {
      throw new Error("Last action was a chain stitch; remove it first (Shift+Click current point)");
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

  uncompleteThread(threadIndex: number) {
    const threads = this.state.threads;
    if (threadIndex < 0 || threadIndex >= threads.length) throw new Error("Invalid thread index");
    if (this.state.activeThread) throw new Error("Cannot un-complete thread while another is active");
    const thread = threads[threadIndex];

    const nextLoad: Load = toggleLoad(
      thread.edges.length > 0 ? thread.edges[thread.edges.length - 1].load : thread.startSide
    );

    const active: ActiveThread = {
      startSide: thread.startSide,
      startHole: thread.startHole,
      edges: thread.edges,
      nextLoad,
      anchorLoops: thread.anchorLoops ?? [],
      chainStitches: thread.chainStitches ?? [],
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
        edges: t.edges.map((e, i) => ({ ...e, index: e.index ?? i + 1 })),
      })),
      activeThread: null,
    };
    this.notify();
  }
}
