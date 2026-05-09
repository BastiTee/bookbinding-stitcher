import type { GridState } from "./model";

export interface SvgCoord {
  x: number;
  y: number;
}

export interface InteractionTarget {
  kind: "spine" | "station" | "hole" | "outside";
  stationX?: number;
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
  const { spine, stations } = state;
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

  // Find nearest station within threshold
  let nearestStation: number | undefined;
  let nearestDist = Infinity;
  for (const st of stations) {
    const dist = Math.abs(coord.x - st.x);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestStation = st.x;
    }
  }

  if (nearestStation !== undefined && nearestDist <= threshold) {
    // Near a station — check if also near an existing hole
    const station = stations.find((s) => s.x === nearestStation);
    if (station) {
      for (const hy of station.holes) {
        if (Math.abs(coord.y - hy) <= threshold) {
          return {
            kind: "hole",
            stationX: nearestStation,
            holeY: hy,
            snappedX: nearestStation,
            snappedY: hy,
          };
        }
      }
    }
    // Near station but not near a hole — target is "add hole here"
    return {
      kind: "station",
      stationX: nearestStation,
      snappedX: nearestStation,
      snappedY: sy,
    };
  }

  // Not near any station — target is "add station here"
  return { kind: "spine", snappedX: sx, snappedY: sy };
}
