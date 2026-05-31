import { describe, it, expect } from "vitest";
import { initialState, placeValue, autoPencil, boxDims, defaultBoxOf } from "./boardState";

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
  it("placeValue prunes only true peers in a 6×6 (2×3 box geometry)", () => {
    let s = initialState(".".repeat(36));
    s = autoPencil(s); // every empty cell gets all candidates 1..6
    const has5 = (st: typeof s, i: number) => (st.notes[i]! & (1 << 5)) !== 0;
    // sanity: before placing, both cells have candidate 5
    expect(has5(s, 8)).toBe(true);
    expect(has5(s, 13)).toBe(true);
    s = placeValue(s, 0, 5); // value 5 at cell (0,0)
    expect(has5(s, 8)).toBe(false);  // (1,2): box-only peer → pruned
    expect(has5(s, 13)).toBe(true);  // (2,1): non-peer → retained
  });
});
