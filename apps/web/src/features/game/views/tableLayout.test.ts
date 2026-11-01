import { describe, expect, it } from "vitest";
import { fitSeats, MAX_SEAT_SCALE, seatDirections } from "./tableLayout";

const phone = { seatW: 142, seatH: 172, centerW: 100, centerH: 125 };

describe("table layout", () => {
  it("starts at the bottom and spreads seats evenly on a circle", () => {
    const d = seatDirections(4, 1, 1);
    expect(d[0]!.cx).toBeCloseTo(0);
    expect(d[0]!.cy).toBeCloseTo(1);
    expect(d[1]!.cx).toBeCloseTo(-1); // clockwise on screen: bottom -> left
    expect(d[2]!.cy).toBeCloseTo(-1);
  });

  it("fits six players on a phone without overlap and scales up on big screens", () => {
    const six = fitSeats({ width: 390, height: 560, players: 6, ...phone });
    expect(six).not.toBeNull();
    expect(six!.scale).toBeGreaterThan(0.75);
    expect(fitSeats({ width: 1280, height: 700, players: 4, seatW: 168, seatH: 172, centerW: 150, centerH: 125 })!.scale).toBe(MAX_SEAT_SCALE);
  });

  it("gives up (list fallback) when nothing fits", () => {
    expect(fitSeats({ width: 360, height: 520, players: 10, ...phone })).toBeNull();
  });
});
