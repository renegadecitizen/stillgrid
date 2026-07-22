import type { Lesson, Cell } from "./types";

// row r (0-based), col c → flat index in a 9×9 grid
const ix = (r: number, c: number) => r * 9 + c;

// Build a 9×9 grid (81 cells). `givens` maps cell index → digit.
function grid9(givens: Record<number, number>): Cell[] {
  return Array.from({ length: 81 }, (_, i) =>
    givens[i] !== undefined ? { given: givens[i]! } : {},
  );
}

// Build a 9×9 grid then attach candidate pencil-marks to specific cells.
function grid9Cands(
  givens: Record<number, number>,
  cands: Record<number, number[]>,
): Cell[] {
  const g = grid9(givens);
  for (const [k, ds] of Object.entries(cands)) {
    g[Number(k)] = { cands: ds };
  }
  return g;
}

// --- naked-single: cell (4,4) sees 1,2,3 (row), 4,5,6 (col), 8,9 (box) → must be 7 ---
const nakedSingleGivens: Record<number, number> = {
  [ix(4, 0)]: 1, [ix(4, 1)]: 2, [ix(4, 2)]: 3, // row 4
  [ix(0, 4)]: 4, [ix(1, 4)]: 5, [ix(2, 4)]: 6, // col 4
  [ix(3, 3)]: 8, [ix(5, 5)]: 9,                // centre box
};

const nakedSingle: Lesson = {
  id: "naked-single",
  title: "Naked single",
  size: 9,
  steps: [
    {
      caption: "Look at the highlighted cell. What can it be?",
      grid: grid9(nakedSingleGivens),
      highlights: [{ cells: [ix(4, 4)], kind: "target" }],
    },
    {
      caption: "Its row already has 1, 2, 3; its column has 4, 5, 6; its box has 8, 9.",
      grid: grid9(nakedSingleGivens),
      highlights: [
        { cells: [ix(4, 0), ix(4, 1), ix(4, 2), ix(0, 4), ix(1, 4), ix(2, 4), ix(3, 3), ix(5, 5)], kind: "unit" },
        { cells: [ix(4, 4)], kind: "target" },
      ],
    },
    {
      caption: "Eight digits are used. Only 7 is left — place it.",
      grid: (() => { const g = grid9(nakedSingleGivens); g[ix(4, 4)] = { value: 7 }; return g; })(),
      highlights: [{ cells: [ix(4, 4)], kind: "place" }],
    },
  ],
};

// --- hidden-single: in the top-left box, only (2,2) can hold a 4 ---
// Box rows 0–1 are filled with 1,2,3,5,6,7 (no 4). 4s outside the box at
// (3,0) and (6,1) block column 0 and column 1, so within the box only (2,2)
// is left for the 4.
const hiddenSingleGivens: Record<number, number> = {
  [ix(0, 0)]: 1, [ix(0, 1)]: 2, [ix(0, 2)]: 3,
  [ix(1, 0)]: 5, [ix(1, 1)]: 6, [ix(1, 2)]: 7,
  [ix(3, 0)]: 4, // blocks column 0 → (2,0) can't be 4
  [ix(6, 1)]: 4, // blocks column 1 → (2,1) can't be 4
};

const hiddenSingle: Lesson = {
  id: "hidden-single",
  title: "Hidden single",
  size: 9,
  steps: [
    {
      caption: "This box still needs a 4. Where can it go?",
      grid: grid9(hiddenSingleGivens),
      highlights: [
        {
          cells: [ix(0, 0), ix(0, 1), ix(0, 2), ix(1, 0), ix(1, 1), ix(1, 2), ix(2, 0), ix(2, 1), ix(2, 2)],
          kind: "unit",
        },
      ],
    },
    {
      caption: "A 4 in column 0 rules out the cell below 1; a 4 in column 1 rules out the cell below 2.",
      grid: grid9(hiddenSingleGivens),
      highlights: [
        { cells: [ix(3, 0), ix(6, 1)], kind: "unit" },
        { cells: [ix(2, 0), ix(2, 1)], kind: "elim" },
      ],
    },
    {
      caption: "Only the corner cell is left in the box — it must be the 4.",
      grid: (() => { const g = grid9(hiddenSingleGivens); g[ix(2, 2)] = { value: 4 }; return g; })(),
      highlights: [{ cells: [ix(2, 2)], kind: "place" }],
    },
  ],
};

// --- naked-pair: in row 0, (0,0) and (0,1) are both exactly {3,7} ---
// Givens 1,2,4,5 in cols 5–8 leave digits {3,6,7,8,9} for cols 0–4. The pair
// claims 3 and 7, so 3 and 7 leave the other empty cells in the row.
const nakedPairGivens: Record<number, number> = {
  [ix(0, 5)]: 1, [ix(0, 6)]: 2, [ix(0, 7)]: 4, [ix(0, 8)]: 5,
};

const nakedPairGrid = grid9Cands(nakedPairGivens, {
  [ix(0, 0)]: [3, 7],
  [ix(0, 1)]: [3, 7],
  [ix(0, 2)]: [3, 6, 8, 9],
  [ix(0, 3)]: [6, 7, 8, 9],
  [ix(0, 4)]: [3, 6, 8, 9],
});

const nakedPair: Lesson = {
  id: "naked-pair",
  title: "Naked pair",
  size: 9,
  steps: [
    {
      caption: "These two cells can each only be 3 or 7.",
      grid: nakedPairGrid,
      highlights: [{ cells: [ix(0, 0), ix(0, 1)], kind: "target" }],
    },
    {
      caption: "Between them they will use up 3 and 7, so no other cell in the row can be 3 or 7.",
      grid: nakedPairGrid,
      highlights: [
        { cells: [ix(0, 0), ix(0, 1)], kind: "target" },
        { cells: [ix(0, 2), ix(0, 3), ix(0, 4)], kind: "elim" },
      ],
    },
    {
      caption: "After removing 3 and 7, those cells are down to {6, 8, 9}.",
      grid: grid9Cands(nakedPairGivens, {
        [ix(0, 0)]: [3, 7],
        [ix(0, 1)]: [3, 7],
        [ix(0, 2)]: [6, 8, 9],
        [ix(0, 3)]: [6, 8, 9],
        [ix(0, 4)]: [6, 8, 9],
      }),
      highlights: [{ cells: [ix(0, 2), ix(0, 3), ix(0, 4)], kind: "elim" }],
    },
  ],
};

// --- pointing-pair: in the top-left box the 6 must sit in row 0 ---
// Box rows 1–2 are filled with non-6 givens, and a 6 in column 2 at (3,2)
// blocks (0,2). So the box's 6 is confined to (0,0)/(0,1) — row 0 — and 6 is
// eliminated from the rest of row 0 outside the box.
const pointingPairGivens: Record<number, number> = {
  [ix(1, 0)]: 1, [ix(1, 1)]: 2, [ix(1, 2)]: 3,
  [ix(2, 0)]: 4, [ix(2, 1)]: 5, [ix(2, 2)]: 8,
  [ix(3, 2)]: 6, // blocks column 2 → (0,2) can't be 6
};

const pointingPair: Lesson = {
  id: "pointing-pair",
  title: "Pointing pair",
  size: 9,
  steps: [
    {
      caption: "In this box, the only cells that can be 6 both sit in the top row.",
      grid: grid9Cands(pointingPairGivens, {
        [ix(0, 0)]: [6, 7, 9],
        [ix(0, 1)]: [6, 7, 9],
        [ix(0, 2)]: [7, 9],
      }),
      highlights: [{ cells: [ix(0, 0), ix(0, 1)], kind: "target" }],
    },
    {
      caption: "Wherever the 6 lands, it lands in this row — so the 6 'points' along it.",
      grid: grid9Cands(pointingPairGivens, {
        [ix(0, 0)]: [6, 7, 9],
        [ix(0, 1)]: [6, 7, 9],
        [ix(0, 2)]: [7, 9],
        [ix(0, 5)]: [6, 8],
        [ix(0, 7)]: [6, 8],
      }),
      highlights: [
        { cells: [ix(0, 0), ix(0, 1)], kind: "target" },
        { cells: [ix(0, 3), ix(0, 4), ix(0, 5), ix(0, 6), ix(0, 7), ix(0, 8)], kind: "unit" },
      ],
    },
    {
      caption: "So 6 can be removed from every other cell in this row, outside the box.",
      grid: grid9Cands(pointingPairGivens, {
        [ix(0, 0)]: [6, 7, 9],
        [ix(0, 1)]: [6, 7, 9],
        [ix(0, 2)]: [7, 9],
        [ix(0, 5)]: [8],
        [ix(0, 7)]: [8],
      }),
      highlights: [{ cells: [ix(0, 5), ix(0, 7)], kind: "elim" }],
    },
  ],
};

// --- x-wing: candidate 5 forms a rectangle on rows 0 & 4, cols 2 & 6 ---
// In each of rows 0 and 4, the 5 can only be in columns 2 or 6. Those four
// corners lock the 5s into both columns, so 5 is eliminated elsewhere in
// columns 2 and 6.
const xWing: Lesson = {
  id: "x-wing",
  title: "X-Wing",
  size: 9,
  steps: [
    {
      caption: "In both highlighted rows, the 5 can only go in these two columns — the four corners of a rectangle.",
      grid: grid9Cands({}, {
        [ix(0, 2)]: [5, 8],
        [ix(0, 6)]: [5, 8],
        [ix(4, 2)]: [5, 9],
        [ix(4, 6)]: [5, 9],
      }),
      highlights: [{ cells: [ix(0, 2), ix(0, 6), ix(4, 2), ix(4, 6)], kind: "target" }],
    },
    {
      caption: "Each row puts its 5 in one of these columns, so together the two columns hold both 5s.",
      grid: grid9Cands({}, {
        [ix(0, 2)]: [5, 8],
        [ix(0, 6)]: [5, 8],
        [ix(4, 2)]: [5, 9],
        [ix(4, 6)]: [5, 9],
        [ix(7, 2)]: [3, 5, 6],
        [ix(7, 6)]: [2, 5, 6],
      }),
      highlights: [
        { cells: [ix(0, 2), ix(0, 6), ix(4, 2), ix(4, 6)], kind: "target" },
        {
          cells: [ix(1, 2), ix(2, 2), ix(3, 2), ix(5, 2), ix(6, 2), ix(7, 2), ix(8, 2), ix(1, 6), ix(2, 6), ix(3, 6), ix(5, 6), ix(6, 6), ix(7, 6), ix(8, 6)],
          kind: "unit",
        },
      ],
    },
    {
      caption: "So 5 can be removed from every other cell in those two columns.",
      grid: grid9Cands({}, {
        [ix(0, 2)]: [5, 8],
        [ix(0, 6)]: [5, 8],
        [ix(4, 2)]: [5, 9],
        [ix(4, 6)]: [5, 9],
        [ix(7, 2)]: [3, 6],
        [ix(7, 6)]: [2, 6],
      }),
      highlights: [{ cells: [ix(7, 2), ix(7, 6)], kind: "elim" }],
    },
  ],
};

// --- xy-wing: pivot {1,2} at (4,4), pincers {1,3} at (4,0) and {2,3} at (0,4) ---
// Whichever value the pivot takes, one pincer becomes 3 — so the corner cell
// (0,0), which sees both pincers, can never be 3.
const xyWingCands: Record<number, number[]> = {
  [ix(4, 4)]: [1, 2],
  [ix(4, 0)]: [1, 3],
  [ix(0, 4)]: [2, 3],
  [ix(0, 0)]: [3, 8],
};

const xyWing: Lesson = {
  id: "xy-wing",
  title: "XY-Wing",
  size: 9,
  steps: [
    {
      caption: "The pivot can only be 1 or 2. It sees two pincers: {1,3} in its row, {2,3} in its column.",
      grid: grid9Cands({}, xyWingCands),
      highlights: [
        { cells: [ix(4, 4)], kind: "target" },
        { cells: [ix(4, 0), ix(0, 4)], kind: "unit" },
      ],
    },
    {
      caption: "Try both: pivot 1 forces the row pincer to 3; pivot 2 forces the column pincer to 3. Either way, one pincer is a 3.",
      grid: grid9Cands({}, xyWingCands),
      highlights: [
        { cells: [ix(4, 4)], kind: "target" },
        { cells: [ix(4, 0), ix(0, 4)], kind: "unit" },
      ],
    },
    {
      caption: "The corner cell sees both pincers, so it can never be 3 — remove it.",
      grid: grid9Cands({}, { ...xyWingCands, [ix(0, 0)]: [8] }),
      highlights: [
        { cells: [ix(4, 0), ix(0, 4)], kind: "unit" },
        { cells: [ix(0, 0)], kind: "elim" },
      ],
    },
  ],
};

// --- swordfish: candidate 4 confined to columns 1/4/7 across rows 1, 4, 7 ---
// The classic 2-2-2 cycle: each row offers two of the three columns. Three
// rows place three 4s into three columns — one each — so 4 leaves every other
// cell of those columns.
const swordfishCands: Record<number, number[]> = {
  [ix(1, 1)]: [4, 7], [ix(1, 4)]: [4, 9],
  [ix(4, 4)]: [2, 4], [ix(4, 7)]: [4, 6],
  [ix(7, 1)]: [4, 5], [ix(7, 7)]: [3, 4],
  [ix(3, 1)]: [4, 8], [ix(5, 4)]: [1, 4], [ix(0, 7)]: [4, 6],
};
const swordfishCorners = [ix(1, 1), ix(1, 4), ix(4, 4), ix(4, 7), ix(7, 1), ix(7, 7)];
const swordfishVictims = [ix(3, 1), ix(5, 4), ix(0, 7)];

const swordfish: Lesson = {
  id: "swordfish",
  title: "Swordfish",
  size: 9,
  steps: [
    {
      caption: "In each of three rows, the candidate 4 fits only in two of the same three columns.",
      grid: grid9Cands({}, swordfishCands),
      highlights: [{ cells: swordfishCorners, kind: "target" }],
    },
    {
      caption: "Those three rows must place three 4s, and all of them land inside these three columns — one per column.",
      grid: grid9Cands({}, swordfishCands),
      highlights: [
        { cells: swordfishCorners, kind: "target" },
        { cells: swordfishVictims, kind: "unit" },
      ],
    },
    {
      caption: "The columns are spoken for, so every other 4 in them goes.",
      grid: grid9Cands({}, {
        ...swordfishCands,
        [ix(3, 1)]: [8],
        [ix(5, 4)]: [1],
        [ix(0, 7)]: [6],
      }),
      highlights: [{ cells: swordfishVictims, kind: "elim" }],
    },
  ],
};

// --- simple coloring: digit 6, a chain of three strong links ---
// Row 1 links (1,1)–(1,7); column 7 links (1,7)–(6,7); row 6 links (6,7)–(6,3).
// Colouring alternately gives colour A = {(1,1),(6,7)}, colour B = {(1,7),(6,3)}.
// The victim (6,1) sees colour A via column 1 and colour B via row 6, so it loses
// its 6 whichever colour turns out to be the true set.
const coloringCands: Record<number, number[]> = {
  [ix(1, 1)]: [1, 6], [ix(1, 7)]: [2, 6],
  [ix(6, 7)]: [3, 6], [ix(6, 3)]: [4, 6],
  [ix(6, 1)]: [5, 6],
};
const coloringA = [ix(1, 1), ix(6, 7)];
const coloringB = [ix(1, 7), ix(6, 3)];

const coloring: Lesson = {
  id: "coloring",
  title: "Simple Coloring",
  size: 9,
  steps: [
    {
      caption: "Take one digit — 6. Each highlighted unit has only two spots for it, a strong link. Colour along the chain, alternating two colours.",
      grid: grid9Cands({}, coloringCands),
      highlights: [
        { cells: coloringA, kind: "target" },
        { cells: coloringB, kind: "unit" },
      ],
    },
    {
      caption: "One colour is the true 6 everywhere, the other is blank — we don't know which. This cell sees a cell of each colour.",
      grid: grid9Cands({}, coloringCands),
      highlights: [
        { cells: coloringA, kind: "target" },
        { cells: coloringB, kind: "unit" },
        { cells: [ix(6, 1)], kind: "elim" },
      ],
    },
    {
      caption: "Whichever colour wins, this cell sits beside a 6 — so it can't be one. Remove it.",
      grid: grid9Cands({}, { ...coloringCands, [ix(6, 1)]: [5] }),
      highlights: [
        { cells: coloringA, kind: "target" },
        { cells: coloringB, kind: "unit" },
        { cells: [ix(6, 1)], kind: "elim" },
      ],
    },
  ],
};

// --- forcing chain: one bivalue pivot, two branches that agree ---
// Pivot (4,4)={1,2}. Branch 1: (4,4)=1 ⇒ (4,8) drops 1 ⇒ =5 ⇒ (0,8) drops 5 ⇒ =7.
// Branch 2: (4,4)=2 ⇒ (0,4) drops 2 ⇒ =7. Either branch puts a 7 in row 0, so the
// bivalue victim (0,1)={7,9} loses its 7 whichever candidate the pivot truly holds.
const forcingCands: Record<number, number[]> = {
  [ix(4, 4)]: [1, 2],
  [ix(4, 8)]: [1, 5], [ix(0, 8)]: [5, 7],
  [ix(0, 4)]: [2, 7],
  [ix(0, 1)]: [7, 9],
};
const forcingBranchA = [ix(4, 8), ix(0, 8)];
const forcingBranchB = [ix(0, 4)];

const forcingChain: Lesson = {
  id: "forcing-chains",
  title: "Forcing chains",
  size: 9,
  steps: [
    {
      caption: "Start at a cell with exactly two candidates — the pivot, {1,2}. One is true; we don't know which, so we'll try both.",
      grid: grid9Cands({}, forcingCands),
      highlights: [{ cells: [ix(4, 4)], kind: "target" }],
    },
    {
      caption: "Assume the pivot is 1. That drops 1 from its neighbour → it becomes 5 → which drops 5 from the cell above → it becomes 7. A 7 lands in the top row.",
      grid: grid9Cands({}, { ...forcingCands, [ix(4, 4)]: [1], [ix(4, 8)]: [5], [ix(0, 8)]: [7] }),
      highlights: [
        { cells: [ix(4, 4)], kind: "target" },
        { cells: forcingBranchA, kind: "unit" },
        { cells: [ix(0, 1)], kind: "elim" },
      ],
    },
    {
      caption: "Now assume the pivot is 2 instead. Following the other neighbour, a 7 again lands in the top row — a different cell, same row.",
      grid: grid9Cands({}, { ...forcingCands, [ix(4, 4)]: [2], [ix(0, 4)]: [7] }),
      highlights: [
        { cells: [ix(4, 4)], kind: "target" },
        { cells: forcingBranchB, kind: "unit" },
        { cells: [ix(0, 1)], kind: "elim" },
      ],
    },
    {
      caption: "Either way the top row already has its 7, so this two-candidate cell can't be 7. Cross it off — only 9 remains. No guess was ever kept.",
      grid: grid9Cands({}, { ...forcingCands, [ix(0, 1)]: [9] }),
      highlights: [{ cells: [ix(0, 1)], kind: "elim" }],
    },
  ],
};

// --- x-sudoku: the main diagonal is an extra unit ---
// Eight of the nine diagonal cells carry 1–7 and 9; only (7,7) is empty and
// only 8 is missing, so the diagonal forces (7,7) = 8.
const xSudokuGivens: Record<number, number> = {
  [ix(0, 0)]: 1, [ix(1, 1)]: 2, [ix(2, 2)]: 3, [ix(3, 3)]: 4,
  [ix(4, 4)]: 5, [ix(5, 5)]: 6, [ix(6, 6)]: 7, [ix(8, 8)]: 9,
};

const xSudoku: Lesson = {
  id: "x-sudoku",
  title: "X-Sudoku",
  size: 9,
  steps: [
    {
      caption: "In X-Sudoku each main diagonal is an extra unit: it must also hold 1–9 with no repeats.",
      grid: grid9(xSudokuGivens),
      highlights: [
        {
          cells: [ix(0, 0), ix(1, 1), ix(2, 2), ix(3, 3), ix(4, 4), ix(5, 5), ix(6, 6), ix(7, 7), ix(8, 8)],
          kind: "unit",
        },
        { cells: [ix(7, 7)], kind: "target" },
      ],
    },
    {
      caption: "This diagonal already shows 1–7 and 9. Only 8 is missing, so the empty cell must be 8.",
      grid: (() => { const g = grid9(xSudokuGivens); g[ix(7, 7)] = { value: 8 }; return g; })(),
      highlights: [{ cells: [ix(7, 7)], kind: "place" }],
    },
  ],
};

// --- jigsaw: irregular regions replace the 3×3 boxes ---
// A full 9-region nonomino tiling (region id per cell) so the demo grid looks
// like a real Jigsaw board, with bold dividers along the region outlines.
// Region 0 is the L-shaped top-left piece used for the lesson: eight cells
// carry 1–8 and the "1–9 once" rule forces the last cell, (3,2), to 9.
const jigsawRegions = [
  0, 0, 0, 1, 1, 1, 1, 2, 2,
  0, 0, 0, 1, 1, 2, 2, 2, 2,
  3, 3, 0, 0, 1, 1, 2, 2, 2,
  3, 3, 0, 4, 1, 4, 5, 5, 5,
  3, 3, 3, 4, 4, 4, 5, 5, 5,
  6, 6, 3, 4, 4, 7, 8, 5, 5,
  6, 6, 3, 4, 4, 7, 8, 8, 5,
  6, 6, 7, 7, 7, 7, 8, 8, 8,
  6, 6, 6, 7, 7, 7, 8, 8, 8,
];
const jigsawRegion = [
  ix(0, 0), ix(0, 1), ix(0, 2),
  ix(1, 0), ix(1, 1), ix(1, 2),
  ix(2, 2), ix(2, 3), ix(3, 2),
];
const jigsawGivens: Record<number, number> = {
  [ix(0, 0)]: 1, [ix(0, 1)]: 2, [ix(0, 2)]: 3,
  [ix(1, 0)]: 4, [ix(1, 1)]: 5, [ix(1, 2)]: 6,
  [ix(2, 2)]: 7, [ix(2, 3)]: 8,
};

const jigsaw: Lesson = {
  id: "jigsaw",
  title: "Jigsaw",
  size: 9,
  regions: jigsawRegions,
  steps: [
    {
      caption: "In Jigsaw, irregular regions replace the 3×3 boxes — each region still needs 1–9 once.",
      grid: grid9(jigsawGivens),
      highlights: [
        { cells: jigsawRegion, kind: "unit" },
        { cells: [ix(3, 2)], kind: "target" },
      ],
    },
    {
      caption: "This region already holds 1–8, so its last empty cell must be the 9.",
      grid: (() => { const g = grid9(jigsawGivens); g[ix(3, 2)] = { value: 9 }; return g; })(),
      highlights: [{ cells: [ix(3, 2)], kind: "place" }],
    },
  ],
};

// --- killer: a 3-cell cage summing to 7 ---
// The only set of three distinct digits 1–9 that sums to 7 is {1,2,4}, so the
// cage's cells are limited to those three candidates.
const killerCage = [ix(0, 0), ix(0, 1), ix(0, 2)];

const killer: Lesson = {
  id: "killer",
  title: "Killer",
  size: 9,
  steps: [
    {
      caption: "These three cells form a cage: they must add up to 7, with no repeats.",
      grid: grid9({}),
      highlights: [{ cells: killerCage, kind: "target" }],
    },
    {
      caption: "The only three different digits that sum to 7 are 1 + 2 + 4 — so those are the only candidates.",
      grid: grid9Cands({}, {
        [ix(0, 0)]: [1, 2, 4],
        [ix(0, 1)]: [1, 2, 4],
        [ix(0, 2)]: [1, 2, 4],
      }),
      highlights: [{ cells: killerCage, kind: "target" }],
    },
    {
      caption: "That rules out 3, 5, 6, 7, 8 and 9 everywhere in the cage before you place a single digit.",
      grid: grid9Cands({}, {
        [ix(0, 0)]: [1, 2, 4],
        [ix(0, 1)]: [1, 2, 4],
        [ix(0, 2)]: [1, 2, 4],
      }),
      highlights: [{ cells: killerCage, kind: "elim" }],
    },
  ],
};

export const LESSONS: Lesson[] = [
  nakedSingle,
  hiddenSingle,
  nakedPair,
  pointingPair,
  xWing,
  xyWing,
  swordfish,
  coloring,
  forcingChain,
  xSudoku,
  jigsaw,
  killer,
];
