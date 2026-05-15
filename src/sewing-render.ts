import type { SewingState, Load, Hole, ChainStitch, HiddenLinkStitch } from "./sewing-model";
import { getCurrentHole } from "./sewing-model";
import type { Spine } from "./model";
import type { ScaleSizes } from "./render";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface PreviewEdge {
  from: Hole;
  to: Hole;
  load: Load;
}

// How far outside the hole the start/end markers are placed (should reach into the grid padding).
const MARKER_OFFSET_MM = 15;
// Small perpendicular nudge so start and end markers don't overlap when on the same hole.
const MARKER_PERP_MM = 3;
// Control-point perpendicular offset per slot when edges share the same endpoint pair.
// With 2 overlapping edges the visual peak deviation from the straight line is half this.
const CURVE_OFFSET_MM = 12;

function normalize(dx: number, dy: number): { x: number; y: number } {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

// Canonical key for an undirected endpoint pair
function pairKey(a: Hole, b: Hole): string {
  if (a.x < b.x || (a.x === b.x && a.y <= b.y)) {
    return `${a.x},${a.y}|${b.x},${b.y}`;
  }
  return `${b.x},${b.y}|${a.x},${a.y}`;
}

type EdgeEntry = {
  from: Hole; to: Hole; load: Load; preview: boolean;
  index?: number;
  hiddenLinkOrigin?: boolean;
};

type ChainEntry = { from: Hole; to: Hole; end: Hole; load: Load; pending?: boolean };

/** Computes chain stitch entries for a thread by walking the interleaved edge/chain sequence. */
function getChainStitchEntries(
  startHole: Hole,
  edges: readonly { load: Load; from: Hole; to: Hole }[],
  chainStitches: readonly ChainStitch[],
): ChainEntry[] {
  if (chainStitches.length === 0) return [];
  const result: ChainEntry[] = [];
  let pos: Hole = startHole;
  let edgeIdx = 0;
  let csIdx = 0;
  while (edgeIdx < edges.length || csIdx < chainStitches.length) {
    const nextCS = csIdx < chainStitches.length ? chainStitches[csIdx] : null;
    if (nextCS && nextCS.afterEdge <= edgeIdx) {
      const hasReturnEdge = edgeIdx < edges.length;
      const end = hasReturnEdge ? { ...edges[edgeIdx].to } : { ...pos };
      result.push({ from: { ...pos }, to: { ...nextCS.hole }, end, load: nextCS.side, pending: !hasReturnEdge });
      pos = end;
      edgeIdx++; // consume the associated return edge
      csIdx++;
    } else if (edgeIdx < edges.length) {
      pos = edges[edgeIdx].to;
      edgeIdx++;
    } else {
      break;
    }
  }
  return result;
}

export function renderSewing(
  svg: SVGSVGElement,
  sewingState: Readonly<SewingState>,
  sizes: ScaleSizes,
  spine: Spine,
  previewEdge?: PreviewEdge | null,
  options?: {
    spineOnly?: boolean;
    anchorLoopEligiblePoints?: Hole[];
    startTailTargets?: Hole[];
    previewAnchorLoop?: Hole;
    previewChainStitch?: { from: Hole; to: Hole; side: Load };
    previewHiddenLink?: { from: Hole; to: Hole; side: Load };
  },
  chainEligibleHoles?: Hole[],
  hiddenLinkEligibleHoles?: Hole[],
): void {
  const spineOnly = options?.spineOnly ?? false;

  // Remove existing sewing layer if present
  const existing = svg.querySelector(".sewing-layer");
  if (existing) existing.remove();

  const layer = document.createElementNS(SVG_NS, "g");
  layer.classList.add("sewing-layer");
  svg.appendChild(layer);

  const active = sewingState.activeThread;

  // --- Collect regular edges (skip edges consumed by chain stitches) ---
  let allEdges: EdgeEntry[] = [];
  for (const thread of sewingState.threads) {
    const consumed = new Set((thread.chainStitches ?? []).map(cs => cs.afterEdge));
    const hlsAfterEdges = new Set((thread.hiddenLinkStitches ?? []).map(hls => hls.afterEdge));
    for (let i = 0; i < thread.edges.length; i++) {
      if (consumed.has(i)) continue;
      const e = thread.edges[i];
      allEdges.push({ from: e.from, to: e.to, load: e.load, preview: false, index: e.index, hiddenLinkOrigin: hlsAfterEdges.has(i + 1) });
    }
  }
  if (active) {
    const consumed = new Set((active.chainStitches ?? []).map(cs => cs.afterEdge));
    const hlsAfterEdges = new Set((active.hiddenLinkStitches ?? []).map(hls => hls.afterEdge));
    for (let i = 0; i < active.edges.length; i++) {
      if (consumed.has(i)) continue;
      const e = active.edges[i];
      allEdges.push({ from: e.from, to: e.to, load: e.load, preview: false, index: e.index, hiddenLinkOrigin: hlsAfterEdges.has(i + 1) });
    }
    if (previewEdge) {
      allEdges.push({ from: previewEdge.from, to: previewEdge.to, load: previewEdge.load, preview: true });
    }
  }

  // --- Collect chain stitches separately (custom path, not subject to slot offsets) ---
  const allChainStitches: ChainEntry[] = [];
  for (const thread of sewingState.threads) {
    for (const cs of getChainStitchEntries(thread.startHole, thread.edges, thread.chainStitches ?? [])) {
      allChainStitches.push(cs);
    }
  }
  if (active) {
    for (const cs of getChainStitchEntries(active.startHole!, active.edges, active.chainStitches ?? [])) {
      allChainStitches.push(cs);
    }
  }

  // In spine-only view: keep only positive edges/chain-stitches, suppress labels
  if (spineOnly) {
    allEdges = allEdges
      .filter(e => e.load === "positive")
      .map(e => ({ ...e, index: undefined }));
  }

  // --- Draw anchor loops first (so thread edges render on top = "through the loop") ---
  const allLoops = [
    ...sewingState.threads.flatMap(t => t.anchorLoops),
    ...(active?.anchorLoops ?? []),
  ];
  for (const loop of allLoops) {
    if (!spineOnly || loop.side === "positive") drawAnchorLoop(layer, loop.hole, loop.side, sizes);
  }

  // --- Draw hidden link stitches (inside-signature paths, always non-spine) ---
  if (!spineOnly) {
    const allHiddenLinks: HiddenLinkStitch[] = [
      ...sewingState.threads.flatMap(t => t.hiddenLinkStitches ?? []),
      ...(active?.hiddenLinkStitches ?? []),
    ];
    for (const hls of allHiddenLinks) {
      if (!hls.pending) drawHiddenLinkStitch(layer, hls.from, hls.to);
    }
  }

  // --- Draw eligible chain hole halos ---
  if (!spineOnly && chainEligibleHoles && chainEligibleHoles.length > 0) {
    drawEligibleHalos(layer, chainEligibleHoles, sizes.dotRadius * 2.2, "chain-eligible-halo");
  }

  // --- Draw anchor-loop-eligible halos (same orange ring, layered on the horseshoe) ---
  const anchorLoopEligiblePoints = options?.anchorLoopEligiblePoints;
  if (!spineOnly && anchorLoopEligiblePoints && anchorLoopEligiblePoints.length > 0) {
    drawEligibleHalos(layer, anchorLoopEligiblePoints, sizes.dotRadius * 2.2, "anchor-loop-eligible-halo");
  }

  // --- Draw hidden-link-eligible halos (blue dashed ring) ---
  if (!spineOnly && hiddenLinkEligibleHoles && hiddenLinkEligibleHoles.length > 0) {
    drawEligibleHalos(layer, hiddenLinkEligibleHoles, sizes.dotRadius * 2.8, "hidden-link-eligible-halo");
  }

  // --- Count occurrences per canonical endpoint pair ---
  const pairCount = new Map<string, number>();
  for (const e of allEdges) {
    const k = pairKey(e.from, e.to);
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }

  // Labels are collected in a separate group appended last so they render above all threads.
  const labelsLayer = document.createElementNS(SVG_NS, "g") as SVGGElement;
  labelsLayer.classList.add("sewing-labels");

  // --- Draw edges with curve offsets (spine-only forces straight lines) ---
  const pairSeen = new Map<string, number>();
  for (const e of allEdges) {
    const k = pairKey(e.from, e.to);
    const total = pairCount.get(k)!;
    const slotIndex = pairSeen.get(k) ?? 0;
    pairSeen.set(k, (pairSeen.get(k) ?? 0) + 1);
    drawEdgeLine(layer, labelsLayer, e.from, e.to, e.load, e.preview, slotIndex, total, e.index, sizes, e.hiddenLinkOrigin);
  }

  // --- Draw chain stitches (custom hook-around-hole path) ---
  if (!spineOnly) {
    for (const cs of allChainStitches) drawChainStitchPath(layer, cs.from, cs.to, cs.end, cs.load, sizes, false, cs.pending);
  } else {
    for (const cs of allChainStitches) {
      if (cs.load === "positive") drawChainStitchPath(layer, cs.from, cs.to, cs.end, cs.load, sizes, false, cs.pending);
    }
  }

  // --- Draw hover-menu previews (shown when hovering a menu item) ---
  if (!spineOnly) {
    if (options?.previewAnchorLoop) {
      drawAnchorLoop(layer, options.previewAnchorLoop, active?.nextLoad ?? "positive", sizes, true);
    }
    if (options?.previewChainStitch) {
      const { from, to, side } = options.previewChainStitch;
      drawChainStitchPath(layer, from, to, from, side, sizes, true);
    }
    if (options?.previewHiddenLink) {
      drawHiddenLinkStitch(layer, options.previewHiddenLink.from, options.previewHiddenLink.to, true);
    }
  }

  // Skip all markers in spine-only view
  if (spineOnly) {
    layer.appendChild(labelsLayer);
    return;
  }

  for (let ti = 0; ti < sewingState.threads.length; ti++) {
    const thread = sewingState.threads[ti];
    const firstTo = thread.edges[0]?.to ?? options?.startTailTargets?.[ti];
    const dir = firstTo
      ? normalize(firstTo.x - thread.startHole.x, firstTo.y - thread.startHole.y)
      : { x: 0, y: thread.startHole.y < spine.height / 2 ? -1 : 1 };
    const perpStart = { x: -dir.y, y: dir.x };
    const startTip = {
      x: thread.startHole.x - dir.x * MARKER_OFFSET_MM + perpStart.x * MARKER_PERP_MM,
      y: thread.startHole.y - dir.y * MARKER_OFFSET_MM + perpStart.y * MARKER_PERP_MM,
    };
    drawTailLine(layer, thread.startHole, startTip, thread.startSide);
    drawStartMarker(layer, startTip, thread.startSide, sizes);

    if (thread.edges.length > 0 && thread.completed) {
      const lastEdge = thread.edges[thread.edges.length - 1];
      if (thread.endType === "knot") {
        drawKnotMarker(layer, lastEdge.to, sizes);
      } else {
        const outY = lastEdge.to.y < spine.height / 2 ? -1 : 1;
        const endTip = {
          x: lastEdge.to.x,
          y: lastEdge.to.y + outY * MARKER_OFFSET_MM,
        };
        const endLoad: Load = lastEdge.load === "positive" ? "negative" : "positive";
        drawTailLine(layer, lastEdge.to, endTip, endLoad);
        drawEndMarker(layer, endTip, endLoad, sizes);
      }
    }
  }

  // --- Markers for active thread ---
  if (active && active.startHole) {
    const firstTo = active.edges[0]?.to ?? previewEdge?.to;
    const dir = firstTo
      ? normalize(firstTo.x - active.startHole.x, firstTo.y - active.startHole.y)
      : { x: 0, y: active.startHole.y < spine.height / 2 ? -1 : 1 };
    const perpStart = { x: -dir.y, y: dir.x };
    const startTip = {
      x: active.startHole.x - dir.x * MARKER_OFFSET_MM + perpStart.x * MARKER_PERP_MM,
      y: active.startHole.y - dir.y * MARKER_OFFSET_MM + perpStart.y * MARKER_PERP_MM,
    };
    drawTailLine(layer, active.startHole, startTip, active.startSide);
    drawStartMarker(layer, startTip, active.startSide, sizes);

    // Current endpoint indicator — always exactly on the hole
    const currentPoint = getCurrentHole(active);
    if (currentPoint) {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", String(currentPoint.x));
      circle.setAttribute("cy", String(currentPoint.y));
      circle.setAttribute("r", String(sizes.dotRadius * 1.4));
      circle.classList.add("thread-current-point");
      layer.appendChild(circle);
    }
  }

  // Labels appended last so they render above all threads and markers.
  layer.appendChild(labelsLayer);
}

function drawEligibleHalos(layer: SVGGElement, holes: Hole[], radius: number, cls: string) {
  for (const p of holes) {
    const halo = document.createElementNS(SVG_NS, "circle");
    halo.setAttribute("cx", String(p.x));
    halo.setAttribute("cy", String(p.y));
    halo.setAttribute("r", String(radius));
    halo.classList.add(cls);
    layer.appendChild(halo);
  }
}

function drawEdgeLabel(labelsLayer: SVGGElement, midX: number, midY: number, index: number) {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(midX));
  circle.setAttribute("cy", String(midY));
  circle.setAttribute("r", "2.24");
  circle.classList.add("thread-edge-label-bg");
  labelsLayer.appendChild(circle);

  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(midX));
  text.setAttribute("y", String(midY));
  text.classList.add("thread-edge-label");
  text.textContent = String(index);
  labelsLayer.appendChild(text);
}

function drawEdgeLine(
  layer: SVGGElement,
  labelsLayer: SVGGElement,
  from: Hole,
  to: Hole,
  load: Load,
  preview: boolean,
  slotIndex: number,
  slotTotal: number,
  index: number | undefined,
  _sizes: ScaleSizes,
  hiddenLinkOrigin?: boolean,
) {
  const loadClass = load === "positive" ? "thread-edge--positive" : "thread-edge--negative";

  // Perpendicular offset for this slot: centre the spread around 0
  const offsetAmount = (slotIndex - (slotTotal - 1) / 2) * CURVE_OFFSET_MM;

  if (offsetAmount === 0 || slotTotal === 1) {
    // Straight line
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(from.x));
    line.setAttribute("y1", String(from.y));
    line.setAttribute("x2", String(to.x));
    line.setAttribute("y2", String(to.y));
    line.classList.add("thread-edge", loadClass);
    if (hiddenLinkOrigin) line.classList.add("thread-edge--hidden-link-origin");
    if (preview) line.classList.add("thread-edge--preview");
    layer.appendChild(line);
    if (index !== undefined && !preview) {
      drawEdgeLabel(labelsLayer, (from.x + to.x) / 2, (from.y + to.y) / 2, index);
    }
    return;
  }

  // Quadratic bezier with control point offset perpendicular to the edge
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  // Canonicalize direction so both A→B and B→A use the same perpendicular orientation
  const isReversed = from.x > to.x || (from.x === to.x && from.y > to.y);
  if (isReversed) { dx = -dx; dy = -dy; }
  const len = Math.sqrt(dx * dx + dy * dy);
  // Perpendicular unit vector (rotate 90°)
  const perpX = len > 0 ? -dy / len : 0;
  const perpY = len > 0 ? dx / len : 0;

  const cx = (from.x + to.x) / 2 + perpX * offsetAmount;
  const cy = (from.y + to.y) / 2 + perpY * offsetAmount;

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`);
  path.setAttribute("fill", "none");
  path.classList.add("thread-edge", loadClass);
  if (hiddenLinkOrigin) path.classList.add("thread-edge--hidden-link-origin");
  if (preview) path.classList.add("thread-edge--preview");
  layer.appendChild(path);
  if (index !== undefined && !preview) {
    // Visual midpoint of quadratic bezier at t=0.5 = midpoint of chord + half the control-point offset
    drawEdgeLabel(labelsLayer, (from.x + to.x) / 2 + perpX * offsetAmount / 2, (from.y + to.y) / 2 + perpY * offsetAmount / 2, index);
  }
}

function drawTailLine(layer: SVGGElement, from: Hole, to: Hole, load: Load) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(from.x));
  line.setAttribute("y1", String(from.y));
  line.setAttribute("x2", String(to.x));
  line.setAttribute("y2", String(to.y));
  line.classList.add("thread-edge", load === "positive" ? "thread-edge--positive" : "thread-edge--negative");
  layer.appendChild(line);
}

function drawStartMarker(layer: SVGGElement, point: Hole, side: Load, sizes: ScaleSizes) {
  const r = sizes.dotRadius * 1.8;
  const x = point.x;
  const y = point.y;
  const pts = `${x},${y - r} ${x - r * 0.8},${y + r * 0.5} ${x + r * 0.8},${y + r * 0.5}`;
  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points", pts);
  poly.classList.add("thread-start-marker");
  poly.classList.add(side === "positive" ? "thread-start-marker--positive" : "thread-start-marker--negative");
  layer.appendChild(poly);
}

function drawEndMarker(layer: SVGGElement, point: Hole, load: Load, sizes: ScaleSizes) {
  const r = sizes.dotRadius * 1.6;
  const x = point.x;
  const y = point.y;
  const pts = `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;
  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points", pts);
  poly.classList.add("thread-end-marker", load === "positive" ? "thread-end-marker--positive" : "thread-end-marker--negative");
  layer.appendChild(poly);
}

function drawKnotMarker(layer: SVGGElement, point: Hole, sizes: ScaleSizes) {
  const r = sizes.dotRadius * 1.8;
  const x = point.x;
  const y = point.y;

  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(x));
  circle.setAttribute("cy", String(y));
  circle.setAttribute("r", String(r));
  circle.classList.add("thread-knot-marker");
  layer.appendChild(circle);

  const arm = r * 0.65;
  const line1 = document.createElementNS(SVG_NS, "line");
  line1.setAttribute("x1", String(x - arm));
  line1.setAttribute("y1", String(y - arm));
  line1.setAttribute("x2", String(x + arm));
  line1.setAttribute("y2", String(y + arm));
  line1.classList.add("thread-knot-cross");
  layer.appendChild(line1);

  const line2 = document.createElementNS(SVG_NS, "line");
  line2.setAttribute("x1", String(x + arm));
  line2.setAttribute("y1", String(y - arm));
  line2.setAttribute("x2", String(x - arm));
  line2.setAttribute("y2", String(y + arm));
  line2.classList.add("thread-knot-cross");
  layer.appendChild(line2);
}

function drawAnchorLoop(layer: SVGGElement, point: Hole, side: Load, sizes: ScaleSizes, preview = false) {
  const w = sizes.dotRadius * 1.4;
  const h = sizes.dotRadius * 3;
  const x = point.x;
  const y = point.y;
  const dir = side === "negative" ? -1 : 1; // negative → up, positive → down

  const d =
    `M ${x - w} ${y} ` +
    `L ${x - w} ${y + dir * h} ` +
    `A ${w} ${w} 0 0 ${side === "negative" ? 1 : 0} ${x + w} ${y + dir * h} ` +
    `L ${x + w} ${y}`;

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.classList.add("anchor-loop", side === "positive" ? "anchor-loop--positive" : "anchor-loop--negative");
  if (preview) path.classList.add("anchor-loop--preview");
  layer.appendChild(path);
}

function drawHiddenLinkStitch(layer: SVGGElement, from: Hole, to: Hole, preview = false): void {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(from.x));
  line.setAttribute("y1", String(from.y));
  line.setAttribute("x2", String(to.x));
  line.setAttribute("y2", String(to.y));
  line.classList.add("hidden-link-stitch");
  if (preview) line.classList.add("hidden-link-stitch--preview");
  layer.appendChild(line);
}

/**
 * Draws a chain stitch as a smooth teardrop: two cubic beziers from the sharp tip at `from`/`end`
 * around the far side of the chain hole (`via + d*loopR`), forming a closed loop with no straight
 * handles. G1 continuity at the round cap; cusp (anti-parallel tangents) at the pointed tip.
 */
function drawChainStitchPath(layer: SVGGElement, from: Hole, via: Hole, end: Hole, load: Load, sizes: ScaleSizes, preview = false, pending = false) {
  const dx = via.x - from.x;
  const dy = via.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const loadClass = load === "positive" ? "thread-edge--positive" : "thread-edge--negative";

  if (len === 0) return;

  const loopR = Math.min(sizes.dotRadius * 2.5, len * 0.42);
  const d    = { x: dx / len, y: dy / len };
  const perp = { x: -dy / len, y: dx / len };
  const sideW = loopR * 0.55;

  // far tip: round cap of the teardrop, past the chain hole
  const farX = via.x + d.x * loopR;
  const farY = via.y + d.y * loopR;

  // Upper arc: from → far (tangents depart/arrive perpendicular → cusp at tip, smooth cap)
  // Lower arc: far → end (G1 smooth cap; perpendicular arrival closes the cusp at end)
  const pathD = pending
    ? `M ${from.x} ${from.y} ` +
      `C ${from.x + perp.x * sideW} ${from.y + perp.y * sideW} ` +
        `${farX + perp.x * sideW} ${farY + perp.y * sideW} ` +
        `${farX} ${farY}`
    : `M ${from.x} ${from.y} ` +
      `C ${from.x + perp.x * sideW} ${from.y + perp.y * sideW} ` +
        `${farX + perp.x * sideW} ${farY + perp.y * sideW} ` +
        `${farX} ${farY} ` +
      `C ${farX - perp.x * sideW} ${farY - perp.y * sideW} ` +
        `${end.x - perp.x * sideW} ${end.y - perp.y * sideW} ` +
        `${end.x} ${end.y}`;

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathD);
  path.setAttribute("fill", "none");
  path.classList.add("thread-edge", loadClass, "thread-edge--chain");
  if (preview) path.classList.add("thread-edge--preview");
  if (pending) path.classList.add("thread-edge--preview");
  layer.appendChild(path);
}
