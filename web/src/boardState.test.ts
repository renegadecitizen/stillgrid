import { describe, it, expect } from "vitest";
import { initialState, placeValue, boxDims, defaultBoxOf } from "./boardState";

describe("boardState size-parametric", () => {
  it("boxDims: 6→2×3, 9→3×3", () => {
    expect(boxDims(6)).toEqual({ bh: 2, bw: 3 });
    expect(boxDims(9)).toEqual({ bh: 3, bw: 3 });
  });
  it("defaultBoxOf(6): 36 entries, 6 boxes, top-left 2×3 is box 0", () => {
    const b = defaultBoxOf(6);
    expect(b.length).toBe(36);
    expect(new Set(b).size).toBe(6);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) expect(b[r * 6 + c]).toBe(0);
  });
  it("initialState infers n=6 from a 36-char givens string", () => {
    const s = initialState(".".repeat(36));
    expect(s.n).toBe(6);
    expect(s.values.length).toBe(36);
  });
  it("initialState infers n=9 from an 81-char string (unchanged)", () => {
    expect(initialState(".".repeat(81)).n).toBe(9);
  });
  it("placeValue prunes 6×6 row/col/box notes for value 5 at cell 0", () => {
    let s = initialState(".".repeat(36));
    s = placeValue(s, 0, 5);
    const has5 = (i: number) => (s.notes[i]! & (1 << 5)) !== 0;
    expect(has5(1)).toBe(false); // same row
    expect(has5(6)).toBe(false); // same col (cell (1,0))
    expect(has5(7)).toBe(false); // same 2×3 box (cell (1,1))
  });
});
