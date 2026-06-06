import type { Lesson } from "./types";

// row r (0-based), col c → flat index in a 9×9 grid
const ix = (r: number, c: number) => r * 9 + c;

// Build a 9×9 grid (81 cells). `givens` maps cell index → digit.
function grid9(givens: Record<number, number>): Lesson["steps"][number]["grid"] {
  return Array.from({ length: 81 }, (_, i) =>
    givens[i] !== undefined ? { given: givens[i]! } : {},
  );
}

// Build a 9×9 grid then attach candidate pencil-marks to specific cells.
function grid9Cands(
  givens: Record<number, number>,
  cands: Record<number, number[]>,
): Lesson["steps"][number]["grid"] {
  const g = grid9(givens);
  for (const [k, ds] of Object.entries(cands)) {
    g[Number(k)] = { cands: ds };
  }
  return g;
}

// --- intro: cell (0,0) sees 2,3,4 (row), 5,6,7 (col), 8,9 (box) → only 1 is left ---
const introGivens: Record<number, number> = {
  [ix(0, 1)]: 2, [ix(0, 2)]: 3, [ix(0, 3)]: 4, // row 0
  [ix(1, 0)]: 5, [ix(2, 0)]: 6, [ix(3, 0)]: 7, // col 0
  [ix(1, 1)]: 8, [ix(2, 2)]: 9,                // top-left box
};

const intro: Lesson = {
  id: "intro",
  title: "Your first move",
  size: 9,
  steps: [
    {
      caption: "Click the only cell that can be a 1.",
      grid: grid9(introGivens),
      highlights: [
        { cells: [ix(0, 1), ix(0, 2), ix(0, 3), ix(1, 0), ix(2, 0), ix(3, 0), ix(1, 1), ix(2, 2)], kind: "unit" },
        { cells: [ix(0, 0)], kind: "target" },
      ],
    },
    {
      caption: "Right — 2–9 all appear in its row, column, or box, so the top-left cell must be 1.",
      grid: (() => { const g = grid9(introGivens); g[ix(0, 0)] = { value: 1 }; return g; })(),
      highlights: [{ cells: [ix(0, 0)], kind: "place" }],
    },
  ],
  interactive: { stepIndex: 0, answerCell: ix(0, 0), answerDigit: 1 },
};

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

const nakedPair: Lesson = {
  id: "naked-pair",
  title: "Naked pair",
  size: 9,
  steps: [
    {
      caption: "These two cells can each only be 3 or 7.",
      grid: grid9Cands(nakedPairGivens, {
        [ix(0, 0)]: [3, 7],
        [ix(0, 1)]: [3, 7],
        [ix(0, 2)]: [3, 6, 8, 9],
        [ix(0, 3)]: [6, 7, 8, 9],
        [ix(0, 4)]: [3, 6, 8, 9],
      }),
      highlights: [{ cells: [ix(0, 0), ix(0, 1)], kind: "target" }],
    },
    {
      caption: "Between them they will use up 3 and 7, so no other cell in the row can be 3 or 7.",
      grid: grid9Cands(nakedPairGivens, {
        [ix(0, 0)]: [3, 7],
        [ix(0, 1)]: [3, 7],
        [ix(0, 2)]: [3, 6, 8, 9],
        [ix(0, 3)]: [6, 7, 8, 9],
        [ix(0, 4)]: [3, 6, 8, 9],
      }),
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
      caption: "In rows 1 and 5, the 5 can only go in these two columns — four corners of a rectangle.",
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

// --- jigsaw: an irregular region replaces a box ---
// Nine orthogonally connected cells form one region; eight carry 1–8 and the
// region's "1–9 once" rule forces the last cell, (2,0), to 9.
const jigsawRegion = [
  ix(0, 0), ix(0, 1), ix(0, 2), ix(0, 3),
  ix(1, 0), ix(1, 1), ix(1, 2), ix(1, 3),
  ix(2, 0),
];
const jigsawGivens: Record<number, number> = {
  [ix(0, 0)]: 1, [ix(0, 1)]: 2, [ix(0, 2)]: 3, [ix(0, 3)]: 4,
  [ix(1, 0)]: 5, [ix(1, 1)]: 6, [ix(1, 2)]: 7, [ix(1, 3)]: 8,
};

const jigsaw: Lesson = {
  id: "jigsaw",
  title: "Jigsaw",
  size: 9,
  steps: [
    {
      caption: "In Jigsaw, irregular regions replace the 3×3 boxes — each region still needs 1–9 once.",
      grid: grid9(jigsawGivens),
      highlights: [
        { cells: jigsawRegion, kind: "unit" },
        { cells: [ix(2, 0)], kind: "target" },
      ],
    },
    {
      caption: "This region already holds 1–8, so its last empty cell must be the 9.",
      grid: (() => { const g = grid9(jigsawGivens); g[ix(2, 0)] = { value: 9 }; return g; })(),
      highlights: [{ cells: [ix(2, 0)], kind: "place" }],
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
  intro,
  nakedSingle,
  hiddenSingle,
  nakedPair,
  pointingPair,
  xWing,
  xSudoku,
  jigsaw,
  killer,
];
