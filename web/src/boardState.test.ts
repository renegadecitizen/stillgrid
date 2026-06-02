import { describe, it, expect } from "vitest";
import { initialState, placeValue, autoPencil, boxDims, defaultBoxOf, digitToChar, charToDigit, isSolved } from "./boardState";

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

describe("digit codec (A–G for 10–16)", () => {
  it("digitToChar: 1–9 decimal, 10–16 → A–G", () => {
    expect(digitToChar(1)).toBe("1");
    expect(digitToChar(9)).toBe("9");
    expect(digitToChar(10)).toBe("A");
    expect(digitToChar(16)).toBe("G");
  });
  it("charToDigit: inverse, case-insensitive, 0 for junk", () => {
    expect(charToDigit("1")).toBe(1);
    expect(charToDigit("9")).toBe(9);
    expect(charToDigit("A")).toBe(10);
    expect(charToDigit("g")).toBe(16);
    expect(charToDigit(".")).toBe(0);
    expect(charToDigit("0")).toBe(0);
  });
  it("round-trips 1..16", () => {
    for (let d = 1; d <= 16; d++) expect(charToDigit(digitToChar(d))).toBe(d);
  });
});

describe("boardState at 16×16", () => {
  it("boxDims(16) → 4×4", () => {
    expect(boxDims(16)).toEqual({ bh: 4, bw: 4 });
  });
  it("initialState infers n=16 from a 256-char string and parses A–G givens", () => {
    const givens = "G" + ".".repeat(255);
    const s = initialState(givens);
    expect(s.n).toBe(16);
    expect(s.values.length).toBe(256);
    expect(s.values[0]).toBe(16);
    expect(s.givenMask[0]).toBe(1);
  });
  it("notes hold bit 16 (Uint32 backing)", () => {
    let s = initialState(".".repeat(256));
    s = autoPencil(s);
    expect((s.notes[0]! & (1 << 16)) !== 0).toBe(true);
  });
  it("isSolved compares A–G correctly", () => {
    const sol = Array.from({ length: 256 }, (_, i) => digitToChar((i % 16) + 1)).join("");
    const s = initialState(".".repeat(256));
    for (let i = 0; i < 256; i++) s.values[i] = (i % 16) + 1;
    expect(isSolved(s, sol)).toBe(true);
  });
});
