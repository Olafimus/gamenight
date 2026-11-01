export interface TableFit {
  /** Container size in px. */
  width: number;
  height: number;
  players: number;
  /** Unscaled seat card size in px. */
  seatW: number;
  seatH: number;
  /** Size of the info block in the middle of the table that seats must not cover. */
  centerW: number;
  centerH: number;
  /** Minimum free space between two cards in px. */
  gap?: number;
}

export interface SeatLayout {
  scale: number;
  /** Per seat position (0 = bottom, clockwise on screen): unit-ellipse coordinates, multiplied by the radii in CSS. */
  dirs: Array<{ cx: number; cy: number }>;
}

/** Below this the 44px touch targets would shrink under ~33px: use the list instead. */
export const MIN_SEAT_SCALE = 0.75;
export const MAX_SEAT_SCALE = 1.3;

/**
 * Seats spread evenly by arc length on an ellipse with radii rx/ry, starting at the bottom, clockwise on screen.
 * (Equal angles would crowd the flat ends of a stretched ellipse, e.g. top and bottom on a phone.)
 */
export function seatDirections(n: number, rx: number, ry: number): Array<{ cx: number; cy: number }> {
  const steps = 720;
  const cum: number[] = [0];
  const at = (k: number) => Math.PI / 2 + (k / steps) * 2 * Math.PI;
  for (let k = 1; k <= steps; k++) {
    const a = at(k - 1);
    const b = at(k);
    cum.push(cum[k - 1]! + Math.hypot(rx * (Math.cos(b) - Math.cos(a)), ry * (Math.sin(b) - Math.sin(a))));
  }
  const total = cum[steps]!;
  return Array.from({ length: n }, (_, i) => {
    const target = (i / n) * total;
    let k = 0;
    while (k < steps && cum[k + 1]! < target) k++;
    const span = cum[k + 1]! - cum[k]!;
    const t = at(k + (span > 0 ? (target - cum[k]!) / span : 0));
    return { cx: Math.cos(t), cy: Math.sin(t) };
  });
}

function layoutAt(f: TableFit, s: number): SeatLayout | null {
  const gap = f.gap ?? 6;
  const w = f.seatW * s;
  const h = f.seatH * s;
  const rx = f.width / 2 - w / 2;
  const ry = f.height / 2 - h / 2;
  if (rx < 0 || ry < 0) return null;
  const dirs = seatDirections(f.players, rx, ry);
  const pts = dirs.map((d) => ({ x: rx * d.cx, y: ry * d.cy }));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    // the middle info block sits at (0, 0)
    if (Math.abs(a.x) < (w + f.centerW) / 2 + gap && Math.abs(a.y) < (h + f.centerH) / 2 + gap) return null;
    for (let j = i + 1; j < pts.length; j++) {
      const b = pts[j]!;
      if (Math.abs(a.x - b.x) < w + gap && Math.abs(a.y - b.y) < h + gap) return null;
    }
  }
  return { scale: s, dirs };
}

/**
 * Largest scale (<= MAX_SEAT_SCALE) at which the seat cards on the table ellipse neither overlap each other
 * nor the middle block; null when even MIN_SEAT_SCALE does not fit (the caller falls back to a list).
 */
export function fitSeats(f: TableFit): SeatLayout | null {
  if (f.players < 1 || f.width <= 0 || f.height <= 0) return null;
  const max = layoutAt(f, MAX_SEAT_SCALE);
  if (max) return max;
  let best = layoutAt(f, MIN_SEAT_SCALE);
  if (!best) return null;
  let lo = MIN_SEAT_SCALE;
  let hi = MAX_SEAT_SCALE;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    const l = layoutAt(f, mid);
    if (l) {
      lo = mid;
      best = l;
    } else hi = mid;
  }
  return { ...best, scale: Math.floor(best.scale * 100) / 100 };
}
