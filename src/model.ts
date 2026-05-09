export interface Spine {
  width: number;  // mm, positive integer
  height: number; // mm, positive integer
}

export interface Hole {
  x: number; // mm position along spine width
  y: number; // mm position along spine height
}

export interface GridState {
  spine: Spine;
  holes: Hole[]; // sorted by x then y
}

type Listener = () => void;

export class GridModel {
  private state: GridState;
  private listeners: Listener[] = [];

  constructor(spine: Spine) {
    assertPositiveInt(spine.width, "Spine width");
    assertPositiveInt(spine.height, "Spine height");
    this.state = { spine: { ...spine }, holes: [] };
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

  private notify() {
    for (const fn of this.listeners) fn();
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
    this.notify();
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
    this.state = { spine: { width: spine.width, height: spine.height }, holes: validatedHoles };
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
