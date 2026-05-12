import type { GridState, Spine } from "./model";

const SVG_NS = "http://www.w3.org/2000/svg";
export const PADDING = 20; // mm padding around spine in viewBox
const GRID_STEP = 10; // mm between major grid lines
const SIG_OVERHANG = 6; // mm signature lines extend beyond spine edges
const BTN_OFFSET = 3; // mm sig-button dots are offset from spine edge

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

  // Layer 0: Signature lines (drawn first so spine rect renders on top)
  if (state.signatures) {
    for (const pos of state.signatures.positions) {
      const line = document.createElementNS(SVG_NS, "line");
      if (state.signatures.orientation === "horizontal") {
        line.setAttribute("x1", String(-SIG_OVERHANG));
        line.setAttribute("x2", String(spine.width + SIG_OVERHANG));
        line.setAttribute("y1", String(pos));
        line.setAttribute("y2", String(pos));
      } else {
        line.setAttribute("x1", String(pos));
        line.setAttribute("x2", String(pos));
        line.setAttribute("y1", String(-SIG_OVERHANG));
        line.setAttribute("y2", String(spine.height + SIG_OVERHANG));
      }
      line.classList.add("sig-line");
      svg.appendChild(line);
    }
  }

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

  // Layer 3: Rulers
  renderRulers(svg, spine);

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

  // Layer 5: Signature margin buttons
  renderSignatureButtons(svg, state);
}

function renderRulers(svg: SVGSVGElement, spine: Readonly<Spine>) {
  const layer = document.createElementNS(SVG_NS, "g");
  layer.classList.add("ruler-layer");

  // Top ruler: baseline at y=0, ticks go upward into padding
  const topBaseline = document.createElementNS(SVG_NS, "line");
  topBaseline.setAttribute("x1", "0");
  topBaseline.setAttribute("y1", "0");
  topBaseline.setAttribute("x2", String(spine.width));
  topBaseline.setAttribute("y2", "0");
  topBaseline.classList.add("ruler-baseline");
  layer.appendChild(topBaseline);

  for (let x = 0; x <= spine.width; x++) {
    const isCm = x % 10 === 0;
    const tick = document.createElementNS(SVG_NS, "line");
    tick.setAttribute("x1", String(x));
    tick.setAttribute("x2", String(x));
    tick.setAttribute("y1", "0");
    tick.setAttribute("y2", isCm ? "-5" : "-2");
    tick.classList.add(isCm ? "ruler-tick-major" : "ruler-tick-minor");
    layer.appendChild(tick);
    if (isCm && x > 0) {
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", String(x));
      label.setAttribute("y", "-7");
      label.setAttribute("text-anchor", "middle");
      label.classList.add("ruler-label");
      label.textContent = String(x);
      layer.appendChild(label);
    }
  }

  // Left ruler: baseline at x=0, ticks go leftward into padding
  const leftBaseline = document.createElementNS(SVG_NS, "line");
  leftBaseline.setAttribute("x1", "0");
  leftBaseline.setAttribute("y1", "0");
  leftBaseline.setAttribute("x2", "0");
  leftBaseline.setAttribute("y2", String(spine.height));
  leftBaseline.classList.add("ruler-baseline");
  layer.appendChild(leftBaseline);

  for (let y = 0; y <= spine.height; y++) {
    const isCm = y % 10 === 0;
    const tick = document.createElementNS(SVG_NS, "line");
    tick.setAttribute("x1", "0");
    tick.setAttribute("x2", isCm ? "-5" : "-2");
    tick.setAttribute("y1", String(y));
    tick.setAttribute("y2", String(y));
    tick.classList.add(isCm ? "ruler-tick-major" : "ruler-tick-minor");
    layer.appendChild(tick);
    if (isCm && y > 0) {
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", "-7");
      label.setAttribute("y", String(y));
      label.setAttribute("text-anchor", "end");
      label.setAttribute("dominant-baseline", "middle");
      label.classList.add("ruler-label");
      label.textContent = String(y);
      layer.appendChild(label);
    }
  }

  svg.appendChild(layer);
}

function renderSignatureButtons(svg: SVGSVGElement, state: Readonly<GridState>) {
  const { spine, signatures } = state;
  const activePositions = new Set(signatures?.positions ?? []);
  const orientation = signatures?.orientation;
  const BTN_R = 0.3;


  // Right-side buttons: indicate horizontal signature positions (Y values)
  for (let y = 0; y <= spine.height; y++) {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", String(spine.width + BTN_OFFSET));
    c.setAttribute("cy", String(y));
    c.setAttribute("r", String(BTN_R));
    c.setAttribute("data-sig-axis", "right");
    c.setAttribute("data-sig-pos", String(y));
    c.classList.add("sig-button");
    if (orientation === "horizontal" && activePositions.has(y)) {
      c.classList.add("sig-button--active");
    } else if (orientation === "vertical") {
      c.classList.add("sig-button--locked");
    }
    svg.appendChild(c);
  }

  // Bottom buttons: indicate vertical signature positions (X values)
  for (let x = 0; x <= spine.width; x++) {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", String(x));
    c.setAttribute("cy", String(spine.height + BTN_OFFSET));
    c.setAttribute("r", String(BTN_R));
    c.setAttribute("data-sig-axis", "bottom");
    c.setAttribute("data-sig-pos", String(x));
    c.classList.add("sig-button");
    if (orientation === "vertical" && activePositions.has(x)) {
      c.classList.add("sig-button--active");
    } else if (orientation === "horizontal") {
      c.classList.add("sig-button--locked");
    }
    svg.appendChild(c);
  }

  if (activePositions.size > 0) {
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("text-anchor", "middle");
    t.classList.add("ruler-label", "sig-direction-label");
    t.textContent = "Direction of signatures";
    if (orientation === "horizontal") {
      const cx = spine.width + BTN_OFFSET + 7;
      const cy = spine.height / 2;
      t.setAttribute("x", String(cx));
      t.setAttribute("y", String(cy));
      t.setAttribute("dominant-baseline", "middle");
      t.setAttribute("transform", `rotate(-90, ${cx}, ${cy})`);
    } else if (orientation === "vertical") {
      t.setAttribute("x", String(spine.width / 2));
      t.setAttribute("y", String(spine.height + BTN_OFFSET + 7));
    }
    svg.appendChild(t);
  }
}
