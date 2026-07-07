import { describe, it, expect } from "vitest";
import {
  TECH_FAMILIES,
  clueCount,
  parseCellChar,
  parsePasted,
  techniqueBreakdown,
  toPuzzleString,
} from "./ladder";

// Every key technique_name() in engine/src/bin/stillgrid-grade.rs can emit.
const ENGINE_KEYS = [
  "NakedSingle",
  "HiddenSingleRow", "HiddenSingleCol", "HiddenSingleBox", "HiddenSingleDiag", "HiddenSingleCage",
  "NakedPairRow", "NakedPairCol", "NakedPairBox", "NakedPairDiag", "NakedPairCage",
  "HiddenPairRow", "HiddenPairCol", "HiddenPairBox", "HiddenPairDiag", "HiddenPairCage",
  "PointingPair", "CageCombo",
  "XWingRow", "XWingCol",
  "SwordfishRow", "SwordfishCol", "XYWing",
  "Coloring", "ForcingChain", "Als",
];

describe("TECH_FAMILIES", () => {
  it("covers every technique key the grader can emit, exactly once", () => {
    const covered = TECH_FAMILIES.flatMap((f) => [...f.keys]);
    expect([...covered].sort()).toEqual([...ENGINE_KEYS].sort());
    expect(new Set(covered).size).toBe(covered.length);
  });
  it("is ordered by tier, easy to nightmare", () => {
    const tiers = TECH_FAMILIES.map((f) => f.tier);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  });
});

describe("techniqueBreakdown", () => {
  it("aggregates directional variants and keeps ladder order", () => {
    const lines = techniqueBreakdown({
      XYWing: 2,
      HiddenSingleCol: 3,
      HiddenSingleRow: 7,
      NakedSingle: 43,
    });
    expect(lines.map((l) => l.label)).toEqual(["Naked single", "Hidden single", "XY-Wing"]);
    expect(lines[1]?.count).toBe(10);
  });
  it("renders unknown future keys unlinked instead of dropping them", () => {
    expect(techniqueBreakdown({ Exocet: 1 })).toEqual([
      { label: "Exocet", count: 1, tier: 5, href: "" },
    ]);
  });
});

describe("parseCellChar", () => {
  it("treats blank, dot, and zero as empty", () => {
    expect(parseCellChar("", 9)).toBe(0);
    expect(parseCellChar(".", 9)).toBe(0);
    expect(parseCellChar("0", 9)).toBe(0);
    expect(parseCellChar(" ", 9)).toBe(0);
  });
  it("bounds digits by grid size", () => {
    expect(parseCellChar("7", 9)).toBe(7);
    expect(parseCellChar("7", 6)).toBeNull();
    expect(parseCellChar("6", 6)).toBe(6);
  });
  it("accepts letters only on 16×16, either case", () => {
    expect(parseCellChar("A", 16)).toBe(10);
    expect(parseCellChar("g", 16)).toBe(16);
    expect(parseCellChar("A", 9)).toBeNull();
    expect(parseCellChar("H", 16)).toBeNull();
  });
});

describe("parsePasted", () => {
  it("detects size from cleaned length", () => {
    const nine = parsePasted(`${"1".repeat(40)} ${".".repeat(41)}`);
    expect("error" in nine ? nine : nine.n).toBe(9);
    const six = parsePasted("123456".repeat(6));
    expect("error" in six ? six : six.n).toBe(6);
  });
  it("accepts separators and 0-for-empty", () => {
    const rows = Array.from({ length: 9 }, () => "0.3456789").join("\n");
    const parsed = parsePasted(rows);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.digits.slice(0, 3)).toEqual([0, 0, 3]);
  });
  it("rejects wrong lengths and illegal symbols with a message", () => {
    expect(parsePasted("123")).toHaveProperty("error");
    expect(parsePasted("X".repeat(81))).toHaveProperty("error");
  });
});

describe("toPuzzleString / clueCount", () => {
  it("round-trips digits to engine format", () => {
    const digits = [0, 5, 0, 16];
    expect(toPuzzleString(digits)).toBe(".5.G");
    expect(clueCount(digits)).toBe(2);
  });
});
