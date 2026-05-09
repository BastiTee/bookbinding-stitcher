export interface Spine {
  width: number;  // mm, positive integer
  height: number; // mm, positive integer
}

export interface Station {
  x: number;      // mm position along spine width
  holes: number[]; // sorted Y positions in mm
}

export interface GridState {
  spine: Spine;
  stations: Station[]; // sorted by x
}

type Listener = () => void;

export class GridModel {
  private state: GridState;
  private listeners: Listener[] = [];

  constructor(spine: Spine) {
    assertPositiveInt(spine.width, "Spine width");
    assertPositiveInt(spine.height, "Spine height");
    this.state = { spine: { ...spine }, stations: [] };
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
    // Reject if existing stations/holes would be out of bounds
    for (const st of this.state.stations) {
      if (st.x > width) {
        throw new Error(`Station at x=${st.x} would exceed new width ${width}`);
      }
      for (const y of st.holes) {
        if (y > height) {
          throw new Error(`Hole at y=${y} in station x=${st.x} would exceed new height ${height}`);
        }
      }
    }
    this.state.spine = { width, height };
    this.notify();
  }

  addStation(x: number) {
    assertNonNegativeInt(x, "Station X");
    if (x > this.state.spine.width) {
      throw new Error(`Station x=${x} exceeds spine width ${this.state.spine.width}`);
    }
    if (this.state.stations.some((s) => s.x === x)) {
      throw new Error(`Station at x=${x} already exists`);
    }
    this.state.stations.push({ x, holes: [] });
    this.state.stations.sort((a, b) => a.x - b.x);
    this.notify();
  }

  removeStation(x: number) {
    const idx = this.state.stations.findIndex((s) => s.x === x);
    if (idx === -1) throw new Error(`No station at x=${x}`);
    this.state.stations.splice(idx, 1);
    this.notify();
  }

  updateStationX(oldX: number, newX: number) {
    assertNonNegativeInt(newX, "Station X");
    if (newX > this.state.spine.width) {
      throw new Error(`Station x=${newX} exceeds spine width ${this.state.spine.width}`);
    }
    const station = this.state.stations.find((s) => s.x === oldX);
    if (!station) throw new Error(`No station at x=${oldX}`);
    if (oldX !== newX && this.state.stations.some((s) => s.x === newX)) {
      throw new Error(`Station at x=${newX} already exists`);
    }
    station.x = newX;
    this.state.stations.sort((a, b) => a.x - b.x);
    this.notify();
  }

  addHole(stationX: number, y: number) {
    assertNonNegativeInt(y, "Hole Y");
    if (y > this.state.spine.height) {
      throw new Error(`Hole y=${y} exceeds spine height ${this.state.spine.height}`);
    }
    const station = this.state.stations.find((s) => s.x === stationX);
    if (!station) throw new Error(`No station at x=${stationX}`);
    if (station.holes.includes(y)) {
      throw new Error(`Hole at y=${y} already exists in station x=${stationX}`);
    }
    station.holes.push(y);
    station.holes.sort((a, b) => a - b);
    this.notify();
  }

  removeHole(stationX: number, y: number) {
    const station = this.state.stations.find((s) => s.x === stationX);
    if (!station) throw new Error(`No station at x=${stationX}`);
    const idx = station.holes.indexOf(y);
    if (idx === -1) throw new Error(`No hole at y=${y} in station x=${stationX}`);
    station.holes.splice(idx, 1);
    this.notify();
  }

  loadState(newState: GridState) {
    if (!newState || typeof newState !== "object" || !newState.spine) {
      throw new Error("Invalid state: expected an object with a \"spine\" property");
    }

    const { spine, stations } = newState;

    assertPositiveInt(spine.width, "Spine width");
    assertPositiveInt(spine.height, "Spine height");

    if (!Array.isArray(stations)) {
      throw new Error("Invalid state: \"stations\" must be an array");
    }

    const seenX = new Set<number>();
    const validatedStations: Station[] = [];

    for (const st of stations) {
      assertNonNegativeInt(st.x, "Station X");
      if (st.x > spine.width) {
        throw new Error(`Station x=${st.x} exceeds spine width ${spine.width}`);
      }
      if (seenX.has(st.x)) {
        throw new Error(`Duplicate station at x=${st.x}`);
      }
      seenX.add(st.x);

      if (!Array.isArray(st.holes)) {
        throw new Error(`Station x=${st.x}: "holes" must be an array`);
      }

      const seenY = new Set<number>();
      const validatedHoles: number[] = [];

      for (const y of st.holes) {
        assertNonNegativeInt(y, `Hole Y in station x=${st.x}`);
        if (y > spine.height) {
          throw new Error(`Hole y=${y} in station x=${st.x} exceeds spine height ${spine.height}`);
        }
        if (seenY.has(y)) {
          throw new Error(`Duplicate hole y=${y} in station x=${st.x}`);
        }
        seenY.add(y);
        validatedHoles.push(y);
      }

      validatedHoles.sort((a, b) => a - b);
      validatedStations.push({ x: st.x, holes: validatedHoles });
    }

    validatedStations.sort((a, b) => a.x - b.x);
    this.state = { spine: { width: spine.width, height: spine.height }, stations: validatedStations };
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
