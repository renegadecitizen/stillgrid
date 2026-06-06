export interface GuidedMove {
  cell: number;     // flat index (row*9+col) the learner must fill
  digit: number;    // the forced digit (1-9)
  unit: number[];   // cells to highlight as the forcing row/col/box
  caption: string;  // the coaching line
}
export interface GuidedGame {
  size: 9;
  givens: Record<number, number>;
  moves: GuidedMove[];
}
export interface Guided {
  readonly index: number;
  readonly complete: boolean;
  current(): GuidedMove;
  attempt(cell: number): boolean; // true if correct (advances)
  placed(): Record<number, number>; // givens + digits placed so far
}

export function createGuided(game: GuidedGame): Guided {
  let i = 0;
  const placed: Record<number, number> = { ...game.givens };
  return {
    get index() { return i; },
    get complete() { return i >= game.moves.length; },
    current() { return game.moves[Math.min(i, game.moves.length - 1)]!; },
    attempt(cell: number) {
      if (i >= game.moves.length) return false;
      const move = game.moves[i]!;
      if (cell !== move.cell) return false;
      placed[move.cell] = move.digit;
      i += 1;
      return true;
    },
    placed() { return { ...placed }; },
  };
}

const ix = (r: number, c: number) => r * 9 + c;

// Authored from a real generated easy classic puzzle. Each of the 12 moves below
// is a genuine forced single (naked or hidden) at the board state AFTER applying
// every prior move, verified against the puzzle's unique solution. Index = row*9+col.
//   givens:  5.3.7..92...5..784...19..5....9..6...4..1.5..3.9...24.6........8.76...1...5.4....
//   solution:563478192192536784478192356751924638246813579389765241614387925827659413935241867
export const GUIDED_GAME: GuidedGame = {
  size: 9,
  givens: {
    [ix(0, 0)]: 5, [ix(0, 2)]: 3, [ix(0, 4)]: 7, [ix(0, 7)]: 9, [ix(0, 8)]: 2,
    [ix(1, 3)]: 5, [ix(1, 6)]: 7, [ix(1, 7)]: 8, [ix(1, 8)]: 4,
    [ix(2, 3)]: 1, [ix(2, 4)]: 9, [ix(2, 7)]: 5,
    [ix(3, 3)]: 9, [ix(3, 6)]: 6,
    [ix(4, 1)]: 4, [ix(4, 4)]: 1, [ix(4, 6)]: 5,
    [ix(5, 0)]: 3, [ix(5, 2)]: 9, [ix(5, 6)]: 2, [ix(5, 7)]: 4,
    [ix(6, 0)]: 6,
    [ix(7, 0)]: 8, [ix(7, 2)]: 7, [ix(7, 3)]: 6, [ix(7, 7)]: 1,
    [ix(8, 2)]: 5, [ix(8, 4)]: 4,
  },
  moves: [
    {
      // Naked single. Peers of (r1,c7) already show 2,3,4,5,6,7,8,9 — only 1 is left.
      cell: ix(0, 6),
      digit: 1,
      unit: [ix(0, 0), ix(0, 2), ix(0, 4), ix(0, 7), ix(0, 8), ix(1, 6), ix(3, 6), ix(4, 6), ix(5, 6), ix(1, 7), ix(1, 8), ix(2, 7)],
      caption: "Look at row 1, column 7. Its row, column, and box already use every digit from 2 to 9, so the only number that can go here is 1.",
    },
    {
      // Naked single. Peers cover 1,2,4,5,6,7,8,9 — only 3 remains.
      cell: ix(2, 6),
      digit: 3,
      unit: [ix(2, 3), ix(2, 4), ix(2, 7), ix(0, 6), ix(1, 6), ix(3, 6), ix(4, 6), ix(5, 6), ix(0, 7), ix(0, 8), ix(1, 7), ix(1, 8)],
      caption: "At row 3, column 7 the same trick works: everything except 3 is already taken by its row, column, and box. So 3 it is.",
    },
    {
      // Naked single. Peers cover 1,2,3,4,5,7,8,9 — only 6 remains.
      cell: ix(2, 8),
      digit: 6,
      unit: [ix(2, 3), ix(2, 4), ix(2, 7), ix(2, 6), ix(0, 8), ix(1, 8), ix(0, 7), ix(1, 7)],
      caption: "Row 3, column 9 now has just one gap in its candidates — only 6 is missing from its neighbours, so place 6.",
    },
    {
      // Hidden single in row 4: 4 can only land in (r4,c6).
      cell: ix(3, 5),
      digit: 4,
      unit: [ix(3, 0), ix(3, 1), ix(3, 2), ix(3, 3), ix(3, 4), ix(3, 5), ix(3, 6), ix(3, 7), ix(3, 8)],
      caption: "Now switch to hidden singles. Row 4 still needs a 4, and the columns and boxes block it from every empty cell except column 6 — so 4 must go there.",
    },
    {
      // Hidden single in row 1: 4 can only land in (r1,c4).
      cell: ix(0, 3),
      digit: 4,
      unit: [ix(0, 0), ix(0, 1), ix(0, 2), ix(0, 3), ix(0, 4), ix(0, 5), ix(0, 6), ix(0, 7), ix(0, 8)],
      caption: "Row 1 is missing a 4 as well. Check each empty cell in the row — only column 4 has no 4 already in its column or box. That is the home for 4.",
    },
    {
      // Hidden single in row 5: 9 can only land in (r5,c9).
      cell: ix(4, 8),
      digit: 9,
      unit: [ix(4, 0), ix(4, 1), ix(4, 2), ix(4, 3), ix(4, 4), ix(4, 5), ix(4, 6), ix(4, 7), ix(4, 8)],
      caption: "Row 5 needs a 9. Every empty cell in the row already sees a 9 except column 9, so the 9 is forced into the last cell.",
    },
    {
      // Hidden single in row 8: 4 can only land in (r8,c7).
      cell: ix(7, 6),
      digit: 4,
      unit: [ix(7, 0), ix(7, 1), ix(7, 2), ix(7, 3), ix(7, 4), ix(7, 5), ix(7, 6), ix(7, 7), ix(7, 8)],
      caption: "In row 8 the missing 4 fits only in column 7 — the other empty cells already have a 4 in their column or box.",
    },
    {
      // Hidden single in row 7: 4 can only land in (r7,c3).
      cell: ix(6, 2),
      digit: 4,
      unit: [ix(6, 0), ix(6, 1), ix(6, 2), ix(6, 3), ix(6, 4), ix(6, 5), ix(6, 6), ix(6, 7), ix(6, 8)],
      caption: "Row 7 wants a 4 too, and column 3 is the one empty cell in the row that can still take it. Place the 4.",
    },
    {
      // Hidden single in row 3: 4 can only land in (r3,c1).
      cell: ix(2, 0),
      digit: 4,
      unit: [ix(2, 0), ix(2, 1), ix(2, 2), ix(2, 3), ix(2, 4), ix(2, 5), ix(2, 6), ix(2, 7), ix(2, 8)],
      caption: "Back to row 3, which still has no 4. With the columns now filling in, column 1 is the only spot left for it.",
    },
    {
      // Hidden single in row 3: 7 can only land in (r3,c2).
      cell: ix(2, 1),
      digit: 7,
      unit: [ix(2, 0), ix(2, 1), ix(2, 2), ix(2, 3), ix(2, 4), ix(2, 5), ix(2, 6), ix(2, 7), ix(2, 8)],
      caption: "Row 3 is also missing a 7, and after the last move only column 2 can hold it. Drop the 7 in.",
    },
    {
      // Hidden single in row 9: 6 can only land in (r9,c8).
      cell: ix(8, 7),
      digit: 6,
      unit: [ix(8, 0), ix(8, 1), ix(8, 2), ix(8, 3), ix(8, 4), ix(8, 5), ix(8, 6), ix(8, 7), ix(8, 8)],
      caption: "Row 9 needs a 6, and every empty cell except column 8 already sees a 6 in its column or box. So 6 goes here.",
    },
    {
      // Hidden single in column 8: 2 can only land in (r7,c8).
      cell: ix(6, 7),
      digit: 2,
      unit: [ix(0, 7), ix(1, 7), ix(2, 7), ix(3, 7), ix(4, 7), ix(5, 7), ix(6, 7), ix(7, 7), ix(8, 7)],
      caption: "Finally, scan a column. Column 8 still lacks a 2, and row 7 is the only cell in that column where a 2 will fit. That completes your first dozen moves.",
    },
  ],
};
