import type { GridState, Spine } from "./model";

const SVG_NS = "http://www.w3.org/2000/svg";
const PADDING = 20; // mm padding around spine in viewBox
const GRID_STEP = 10; // mm between major grid lines

export interface HighlightState {
  selectedHole: { x: number; y: number } | null;
}

export interface ScaleSizes {
  dotRadius: number;
  fontSize: number;
}

/** Compute scale-aware dot radius and font size for a given spine. */
export function computeScaleSizes(spine: Readonly<Spine>): ScaleSizes {
  const scale = Math.min(spine.width, spine.height);
  return {
    dotRadius: Math.max(1.5, scale * 0.012),
    fontSize: Math.max(3, scale * 0.03),
  };
}

export function renderGrid(
  svg: SVGSVGElement,
  state: Readonly<GridState>,
  highlight: HighlightState,
) {
  const { spine, holes } = state;

  // Set viewBox with padding
  const vbX = -PADDING;
  const vbY = -PADDING;
  const vbW = spine.width + PADDING * 2;
  const vbH = spine.height + PADDING * 2;
  svg.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);

  // Clear previous content
  svg.innerHTML = "";

  // Layer 1: Spine rectangle
  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", "0");
  rect.setAttribute("y", "0");
  rect.setAttribute("width", String(spine.width));
  rect.setAttribute("height", String(spine.height));
  rect.classList.add("spine-rect");
  svg.appendChild(rect);

  // Layer 2: Grid lines (10mm intervals)
  for (let x = GRID_STEP; x < spine.width; x += GRID_STEP) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x));
    line.setAttribute("y1", "0");
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(spine.height));
    line.classList.add("grid-line-major");
    svg.appendChild(line);
  }
  for (let y = GRID_STEP; y < spine.height; y += GRID_STEP) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", String(y));
    line.setAttribute("x2", String(spine.width));
    line.setAttribute("y2", String(y));
    line.classList.add("grid-line-major");
    svg.appendChild(line);
  }

  const { dotRadius } = computeScaleSizes(spine);

  // Layer 3: Column guide lines — one per unique X value present in holes
  const columnXs = [...new Set(holes.map(h => h.x))].sort((a, b) => a - b);
  for (const x of columnXs) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x));
    line.setAttribute("y1", "0");
    line.setAttribute("x2", String(x));
    line.setAttribute("y2", String(spine.height));
    line.classList.add("station-line");
    svg.appendChild(line);
  }

  // Layer 4: Hole dots
  for (const h of holes) {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(h.x));
    circle.setAttribute("cy", String(h.y));
    circle.setAttribute("r", String(dotRadius));
    circle.setAttribute("data-hole-x", String(h.x));
    circle.setAttribute("data-hole-y", String(h.y));
    circle.classList.add("hole-dot");
    if (highlight.selectedHole?.x === h.x && highlight.selectedHole?.y === h.y) {
      circle.classList.add("selected");
    }
    svg.appendChild(circle);
  }
}
