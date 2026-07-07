// Pure logic for /grade: puzzle-string parsing and the technique ladder.
// TECH_FAMILIES mirrors server/src/daily-pages.ts (keys from technique_name()
// in engine/src/bin/stillgrid-grade.rs) — keep the three in sync.

import { charToDigit, digitToChar, type Size } from "../boardState";

export const SIZES: readonly Size[] = [6, 9, 16];

export interface TechFamily {
  label: string;
  keys: readonly string[];
  tier: 1 | 2 | 3 | 4 | 5;
  href: string;
}

export const TECH_FAMILIES: readonly TechFamily[] = [
  { label: "Naked single", keys: ["NakedSingle"], tier: 1, href: "/learn#naked-single" },
  {
    label: "Hidden single",
    keys: ["HiddenSingleRow", "HiddenSingleCol", "HiddenSingleBox", "HiddenSingleDiag", "HiddenSingleCage"],
    tier: 1,
    href: "/learn#hidden-single",
  },
  {
    label: "Naked pair",
    keys: ["NakedPairRow", "NakedPairCol", "NakedPairBox", "NakedPairDiag", "NakedPairCage"],
    tier: 2,
    href: "/learn/core#naked-pair",
  },
  {
    label: "Hidden pair",
    keys: ["HiddenPairRow", "HiddenPairCol", "HiddenPairBox", "HiddenPairDiag", "HiddenPairCage"],
    tier: 2,
    href: "/learn/core#hidden-pair",
  },
  { label: "Pointing pair", keys: ["PointingPair"], tier: 2, href: "/learn/core#pointing-pair" },
  { label: "Cage combinations", keys: ["CageCombo"], tier: 2, href: "/killer-sudoku-calculator" },
  { label: "X-Wing", keys: ["XWingRow", "XWingCol"], tier: 3, href: "/learn/advanced#x-wing" },
  { label: "Swordfish", keys: ["SwordfishRow", "SwordfishCol"], tier: 4, href: "/learn/advanced#swordfish" },
  { label: "XY-Wing", keys: ["XYWing"], tier: 4, href: "/learn/advanced#swordfish" },
  { label: "Coloring", keys: ["Coloring"], tier: 5, href: "/learn/advanced#swordfish" },
  { label: "Forcing chain", keys: ["ForcingChain"], tier: 5, href: "/learn/advanced#swordfish" },
  { label: "Almost Locked Set", keys: ["Als"], tier: 5, href: "/learn/advanced#swordfish" },
];

export interface TechLine {
  label: string;
  count: number;
  tier: number;
  href: string;
}

export function techniqueBreakdown(counts: Record<string, number>): TechLine[] {
  const out: TechLine[] = [];
  const seen = new Set<string>();
  for (const fam of TECH_FAMILIES) {
    let n = 0;
    for (const k of fam.keys) {
      seen.add(k);
      n += counts[k] ?? 0;
    }
    if (n > 0) out.push({ label: fam.label, count: n, tier: fam.tier, href: fam.href });
  }
  for (const [k, n] of Object.entries(counts)) {
    if (!seen.has(k) && n > 0) out.push({ label: k, count: n, tier: 5, href: "" });
  }
  return out;
}

export const TIER_NAMES: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  diabolical: "Diabolical",
  nightmare: "Nightmare",
};

// --- puzzle-string parsing ----------------------------------------------

// One grid cell's worth of user text → digit (0 = empty), or null if it
// isn't a legal symbol for this size. Accepts '.', '0', and blank as empty;
// letters a–g (either case) as 10–16 on the 16×16 grid.
export function parseCellChar(raw: string, n: Size): number | null {
  const ch = raw.trim().toUpperCase();
  if (ch === "" || ch === "." || ch === "0") return 0;
  const d = charToDigit(ch);
  return d >= 1 && d <= n ? d : null;
}

// A pasted puzzle: strip whitespace/separators, detect size from length.
// Returns digits (0 = empty) or an error string.
export function parsePasted(raw: string): { n: Size; digits: number[] } | { error: string } {
  const cleaned = raw.replace(/[\s,;|]/g, "");
  const n = ({ 36: 6, 81: 9, 256: 16 } as const)[cleaned.length as 36 | 81 | 256];
  if (!n) {
    return {
      error: `Expected 36, 81, or 256 characters (got ${cleaned.length}). Use . or 0 for empty cells.`,
    };
  }
  const digits: number[] = [];
  for (const ch of cleaned) {
    const d = parseCellChar(ch, n);
    if (d === null) return { error: `"${ch}" isn't a valid symbol for a ${n}×${n} grid.` };
    digits.push(d);
  }
  return { n, digits };
}

// Digits → the engine's puzzle-string format.
export function toPuzzleString(digits: readonly number[]): string {
  return digits.map((d) => (d === 0 ? "." : digitToChar(d))).join("");
}

export function clueCount(digits: readonly number[]): number {
  return digits.reduce((acc, d) => (d > 0 ? acc + 1 : acc), 0);
}
