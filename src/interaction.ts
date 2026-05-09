import type { GridState } from "./model";

export interface SvgCoord {
  x: number;
  y: number;
}

export interface InteractionTarget {
  kind: "spine" | "hole" | "outside";
  holeX?: number;
  holeY?: number;
  snappedX: number;
  snappedY: number;
}

/** Convert a mouse event's screen position to SVG user-space coordinates. */
export function screenToSvg(svg: SVGSVGElement, event: MouseEvent): SvgCoord {
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const svgPt = pt.matrixTransform(ctm.inverse());
  return { x: svgPt.x, y: svgPt.y };
}

/** Snap a value to the nearest integer, clamped to [min, max]. */
export function snapToGrid(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

/** Convert a pixel distance to mm using the SVG's current CTM scale factor. */
export function getProximityMm(svg: SVGSVGElement, px: number): number {
  const ctm = svg.getScreenCTM();
  if (!ctm) return px;
  // ctm.a is the horizontal scale (screen px per SVG unit/mm)
  return px / ctm.a;
}

/** Determine what the user is pointing at. */
export function resolveTarget(
  svg: SVGSVGElement,
  coord: SvgCoord,
  state: Readonly<GridState>,
): InteractionTarget {
  const { spine, holes } = state;
  const threshold = getProximityMm(svg, 10);

  const sx = snapToGrid(coord.x, 0, spine.width);
  const sy = snapToGrid(coord.y, 0, spine.height);

  // Outside spine bounds (with some tolerance)?
  if (
    coord.x < -threshold ||
    coord.x > spine.width + threshold ||
    coord.y < -threshold ||
    coord.y > spine.height + threshold
  ) {
    return { kind: "outside", snappedX: sx, snappedY: sy };
  }

  // Find nearest hole within threshold (Euclidean distance)
  let nearestHole: { x: number; y: number } | undefined;
  let nearestDist = Infinity;
  for (const h of holes) {
    const dx = coord.x - h.x;
    const dy = coord.y - h.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestHole = h;
    }
  }

  if (nearestHole !== undefined && nearestDist <= threshold) {
    return {
      kind: "hole",
      holeX: nearestHole.x,
      holeY: nearestHole.y,
      snappedX: nearestHole.x,
      snappedY: nearestHole.y,
    };
  }

  // Not near any hole — target is "add hole here"
  return { kind: "spine", snappedX: sx, snappedY: sy };
}
