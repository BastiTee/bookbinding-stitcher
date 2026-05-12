export interface Spine {
  width: number;  // mm, positive integer
  height: number; // mm, positive integer
}

export interface Hole {
  x: number; // mm position along spine width
  y: number; // mm position along spine height
}

export interface GridSignatures {
  orientation: "horizontal" | "vertical";
  positions: number[]; // sorted unique ints; Y values if horizontal, X if vertical
}

export interface GridState {
  spine: Spine;
  holes: Hole[]; // sorted by x then y
  signatures?: GridSignatures;
}

type Listener = () => void;

export class GridModel {
  private state: GridState;
  private listeners: Listener[] = [];
  private sigListeners: Listener[] = [];

  constructor(spine: Spine) {
    assertPositiveInt(spine.width, "Spine width");
    assertPositiveInt(spine.height, "Spine height");
    this.state = { spine: { ...spine }, holes: [], signatures: undefined };
  }

  getState(): Readonly<GridState> {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  subscribeSignatures(fn: Listener): () => void {
    this.sigListeners.push(fn);
    return () => {
      this.sigListeners = this.sigListeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  private notifySignatures() {
    for (const fn of this.sigListeners) fn();
  }

  setSpine(width: number, height: number) {
    assertPositiveInt(width, "Spine width");
    assertPositiveInt(height, "Spine height");
    for (const h of this.state.holes) {
      if (h.x > width) {
        throw new Error(`Hole at x=${h.x} would exceed new width ${width}`);
      }
      if (h.y > height) {
        throw new Error(`Hole at x=${h.x},y=${h.y} would exceed new height ${height}`);
      }
    }
    this.state.spine = { width, height };
    if (this.state.signatures) {
      const bound = this.state.signatures.orientation === "horizontal" ? height : width;
      const filtered = this.state.signatures.positions.filter(p => p >= 0 && p <= bound);
      if (filtered.length !== this.state.signatures.positions.length) {
        this.state.signatures = filtered.length > 0
          ? { orientation: this.state.signatures.orientation, positions: filtered }
          : undefined;
        this.notifySignatures();
      }
    }
    this.notify();
  }

  addSignature(orientation: "horizontal" | "vertical", position: number): void {
    assertNonNegativeInt(position, "Signature position");
    const bound = orientation === "horizontal" ? this.state.spine.height : this.state.spine.width;
    if (position > bound) {
      throw new Error(`Signature position ${position} must be at most ${bound}`);
    }
    if (this.state.signatures && this.state.signatures.orientation !== orientation) {
      throw new Error("Cannot mix horizontal and vertical signatures");
    }
    if (this.state.signatures?.positions.includes(position)) return;
    const positions = [...(this.state.signatures?.positions ?? []), position].sort((a, b) => a - b);
    this.state.signatures = { orientation, positions };
    this.notifySignatures();
  }

  removeSignature(position: number): void {
    if (!this.state.signatures) return;
    const positions = this.state.signatures.positions.filter(p => p !== position);
    this.state.signatures = positions.length > 0
      ? { orientation: this.state.signatures.orientation, positions }
      : undefined;
    this.notifySignatures();
  }

  addHole(x: number, y: number) {
    assertNonNegativeInt(x, "Hole X");
    assertNonNegativeInt(y, "Hole Y");
    if (x > this.state.spine.width) {
      throw new Error(`Hole x=${x} exceeds spine width ${this.state.spine.width}`);
    }
    if (y > this.state.spine.height) {
      throw new Error(`Hole y=${y} exceeds spine height ${this.state.spine.height}`);
    }
    if (this.state.holes.some((h) => h.x === x && h.y === y)) {
      throw new Error(`Hole at x=${x},y=${y} already exists`);
    }
    this.state.holes.push({ x, y });
    this.state.holes.sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
    this.notify();
  }

  removeHole(x: number, y: number) {
    const idx = this.state.holes.findIndex((h) => h.x === x && h.y === y);
    if (idx === -1) throw new Error(`No hole at x=${x},y=${y}`);
    this.state.holes.splice(idx, 1);
    this.notify();
  }

  loadState(newState: GridState) {
    if (!newState || typeof newState !== "object" || !newState.spine) {
      throw new Error("Invalid state: expected an object with a \"spine\" property");
    }

    const { spine, holes } = newState;

    assertPositiveInt(spine.width, "Spine width");
    assertPositiveInt(spine.height, "Spine height");

    if (!Array.isArray(holes)) {
      throw new Error("Invalid state: \"holes\" must be an array");
    }

    const seen = new Set<string>();
    const validatedHoles: Hole[] = [];

    for (const h of holes) {
      assertNonNegativeInt(h.x, "Hole X");
      assertNonNegativeInt(h.y, "Hole Y");
      if (h.x > spine.width) {
        throw new Error(`Hole x=${h.x} exceeds spine width ${spine.width}`);
      }
      if (h.y > spine.height) {
        throw new Error(`Hole y=${h.y} exceeds spine height ${spine.height}`);
      }
      const key = `${h.x},${h.y}`;
      if (seen.has(key)) {
        throw new Error(`Duplicate hole at x=${h.x},y=${h.y}`);
      }
      seen.add(key);
      validatedHoles.push({ x: h.x, y: h.y });
    }

    validatedHoles.sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);

    let signatures: GridSignatures | undefined;
    const rawSig = (newState as unknown as Record<string, unknown>).signatures;
    if (rawSig && typeof rawSig === "object") {
      const s = rawSig as Record<string, unknown>;
      if ((s.orientation === "horizontal" || s.orientation === "vertical") && Array.isArray(s.positions)) {
        const bound = s.orientation === "horizontal" ? spine.height : spine.width;
        const positions = (s.positions as unknown[])
          .filter((p): p is number => typeof p === "number" && Number.isInteger(p) && p >= 0 && p <= bound)
          .sort((a, b) => a - b);
        if (positions.length > 0) {
          signatures = { orientation: s.orientation, positions };
        }
      }
    }

    this.state = { spine: { width: spine.width, height: spine.height }, holes: validatedHoles, signatures };
    this.notify();
  }
}

function assertPositiveInt(n: number, label: string) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${label} must be a positive integer, got ${n}`);
  }
}

function assertNonNegativeInt(n: number, label: string) {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer, got ${n}`);
  }
}
