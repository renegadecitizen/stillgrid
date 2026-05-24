//! Human-style technique solver.
//!
//! Week 3 shipped Tier 1 (naked single, hidden single).
//! Week 4 adds Tier 2 (naked pair, hidden pair, pointing pair) and
//! Tier 3 (X-Wing). Box-line reduction, naked triple/quad, and forcing
//! chains land in Week 4–5 as the bench data justifies.
//!
//! The technique solver is the foundation of the difficulty rater: a puzzle's
//! difficulty is the highest-tier technique required to solve it using human
//! logic only (no backtracking).

use crate::board::{Board, CELLS, N};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Technique {
    // Tier 1 — placement
    NakedSingle,
    HiddenSingleRow,
    HiddenSingleCol,
    HiddenSingleBox,
    // Tier 2 — candidate elimination
    NakedPairRow,
    NakedPairCol,
    NakedPairBox,
    HiddenPairRow,
    HiddenPairCol,
    HiddenPairBox,
    PointingPair,
    // Tier 3 — candidate elimination
    XWingRow,
    XWingCol,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Tier {
    T1Easy = 1,
    T2Medium = 2,
    T3Hard = 3,
    T4Diabolical = 4,
    T5Nightmare = 5,
}

impl Technique {
    pub fn tier(self) -> Tier {
        use Technique::*;
        match self {
            NakedSingle | HiddenSingleRow | HiddenSingleCol | HiddenSingleBox => Tier::T1Easy,
            NakedPairRow | NakedPairCol | NakedPairBox | HiddenPairRow | HiddenPairCol
            | HiddenPairBox | PointingPair => Tier::T2Medium,
            XWingRow | XWingCol => Tier::T3Hard,
        }
    }
}

/// A solver step is either a placement (fills a cell) or an elimination
/// (removes one or more candidates without filling).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Step {
    Placement {
        technique: Technique,
        row: usize,
        col: usize,
        value: u8,
    },
    Elimination {
        technique: Technique,
        /// (row, col, value-removed) — at least one entry, often many.
        removed: Vec<(usize, usize, u8)>,
    },
}

impl Step {
    pub fn technique(&self) -> Technique {
        match self {
            Step::Placement { technique, .. } => *technique,
            Step::Elimination { technique, .. } => *technique,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GradeOutcome {
    Solved {
        solution: Board,
        steps: Vec<Step>,
        tier: Tier,
    },
    Stuck {
        partial: Board,
        steps: Vec<Step>,
    },
}

impl GradeOutcome {
    pub fn tier(&self) -> Option<Tier> {
        match self {
            GradeOutcome::Solved { tier, .. } => Some(*tier),
            GradeOutcome::Stuck { .. } => None,
        }
    }
}

// --- candidate grid -------------------------------------------------------

#[derive(Clone, Copy)]
struct Candidates([u16; CELLS]);

const ALL: u16 = 0b11_1111_1110; // bits 1..=9

impl Candidates {
    fn from_board(b: &Board) -> Self {
        let mut c = Candidates([ALL; CELLS]);
        for r in 0..N {
            for col in 0..N {
                let v = b.get(r, col);
                if v != 0 {
                    c.fill(r, col, v);
                }
            }
        }
        c
    }

    #[inline]
    fn get(&self, r: usize, c: usize) -> u16 {
        self.0[r * N + c]
    }

    #[inline]
    fn set(&mut self, r: usize, c: usize, m: u16) {
        self.0[r * N + c] = m;
    }

    /// Mark (r,c) as filled with `v`; remove `v` from peers.
    fn fill(&mut self, r: usize, c: usize, v: u8) {
        self.0[r * N + c] = 0;
        let mask = !(1u16 << v);
        for i in 0..N {
            self.0[r * N + i] &= mask;
            self.0[i * N + c] &= mask;
        }
        let br = (r / 3) * 3;
        let bc = (c / 3) * 3;
        for rr in br..br + 3 {
            for cc in bc..bc + 3 {
                self.0[rr * N + cc] &= mask;
            }
        }
    }
}

#[inline]
fn popcount(m: u16) -> u32 {
    m.count_ones()
}

#[inline]
fn only_bit(m: u16) -> u8 {
    debug_assert_eq!(popcount(m), 1);
    m.trailing_zeros() as u8
}

#[inline]
fn bit(v: u8) -> u16 {
    1u16 << v
}

// --- unit iterators -------------------------------------------------------

fn row_cells(r: usize) -> Vec<(usize, usize)> {
    (0..N).map(|c| (r, c)).collect()
}
fn col_cells(c: usize) -> Vec<(usize, usize)> {
    (0..N).map(|r| (r, c)).collect()
}
fn box_cells(b: usize) -> Vec<(usize, usize)> {
    let br = (b / 3) * 3;
    let bc = (b % 3) * 3;
    let mut v = Vec::with_capacity(9);
    for rr in br..br + 3 {
        for cc in bc..bc + 3 {
            v.push((rr, cc));
        }
    }
    v
}

// --- Tier 1: singles ------------------------------------------------------

fn find_naked_single(c: &Candidates) -> Option<Step> {
    for r in 0..N {
        for col in 0..N {
            let m = c.get(r, col);
            if popcount(m) == 1 {
                return Some(Step::Placement {
                    technique: Technique::NakedSingle,
                    row: r,
                    col,
                    value: only_bit(m),
                });
            }
        }
    }
    None
}

fn find_hidden_single_unit(
    c: &Candidates,
    cells: &[(usize, usize)],
    tech: Technique,
) -> Option<Step> {
    for v in 1u8..=9 {
        let b = bit(v);
        let mut count = 0usize;
        let mut at = (0usize, 0usize);
        for &(r, col) in cells {
            if c.get(r, col) & b != 0 {
                count += 1;
                at = (r, col);
                if count > 1 {
                    break;
                }
            }
        }
        if count == 1 {
            return Some(Step::Placement {
                technique: tech,
                row: at.0,
                col: at.1,
                value: v,
            });
        }
    }
    None
}

fn find_hidden_single(c: &Candidates) -> Option<Step> {
    for r in 0..N {
        if let Some(s) = find_hidden_single_unit(c, &row_cells(r), Technique::HiddenSingleRow) {
            return Some(s);
        }
    }
    for col in 0..N {
        if let Some(s) = find_hidden_single_unit(c, &col_cells(col), Technique::HiddenSingleCol) {
            return Some(s);
        }
    }
    for b in 0..9 {
        if let Some(s) = find_hidden_single_unit(c, &box_cells(b), Technique::HiddenSingleBox) {
            return Some(s);
        }
    }
    None
}

// --- Tier 2: naked pair ---------------------------------------------------

fn find_naked_pair_unit(
    c: &Candidates,
    cells: &[(usize, usize)],
    tech: Technique,
) -> Option<Step> {
    for i in 0..cells.len() {
        let (r1, c1) = cells[i];
        let m1 = c.get(r1, c1);
        if popcount(m1) != 2 {
            continue;
        }
        for j in (i + 1)..cells.len() {
            let (r2, c2) = cells[j];
            if c.get(r2, c2) != m1 {
                continue;
            }
            // Naked pair found. Eliminate m1's bits from other cells in unit.
            let mut removed = Vec::new();
            for &(r, col) in cells {
                if (r, col) == (r1, c1) || (r, col) == (r2, c2) {
                    continue;
                }
                let other = c.get(r, col);
                let overlap = other & m1;
                if overlap == 0 {
                    continue;
                }
                for v in 1u8..=9 {
                    if overlap & bit(v) != 0 {
                        removed.push((r, col, v));
                    }
                }
            }
            if !removed.is_empty() {
                return Some(Step::Elimination {
                    technique: tech,
                    removed,
                });
            }
        }
    }
    None
}

fn find_naked_pair(c: &Candidates) -> Option<Step> {
    for r in 0..N {
        if let Some(s) = find_naked_pair_unit(c, &row_cells(r), Technique::NakedPairRow) {
            return Some(s);
        }
    }
    for col in 0..N {
        if let Some(s) = find_naked_pair_unit(c, &col_cells(col), Technique::NakedPairCol) {
            return Some(s);
        }
    }
    for b in 0..9 {
        if let Some(s) = find_naked_pair_unit(c, &box_cells(b), Technique::NakedPairBox) {
            return Some(s);
        }
    }
    None
}

// --- Tier 2: hidden pair --------------------------------------------------

fn find_hidden_pair_unit(
    c: &Candidates,
    cells: &[(usize, usize)],
    tech: Technique,
) -> Option<Step> {
    // For each pair of digits (v1, v2), find cells in the unit where each
    // digit can appear. If both digits appear in exactly the same 2 cells
    // (and only those), those cells must be {v1, v2} — eliminate everything
    // else from them.
    for v1 in 1u8..=8 {
        let b1 = bit(v1);
        let mut cells_v1 = Vec::new();
        for &(r, col) in cells {
            if c.get(r, col) & b1 != 0 {
                cells_v1.push((r, col));
            }
        }
        if cells_v1.len() != 2 {
            continue;
        }
        for v2 in (v1 + 1)..=9 {
            let b2 = bit(v2);
            let mut cells_v2 = Vec::new();
            for &(r, col) in cells {
                if c.get(r, col) & b2 != 0 {
                    cells_v2.push((r, col));
                }
            }
            if cells_v2 != cells_v1 {
                continue;
            }
            // Same two cells. If either cell has more than {v1, v2}, eliminate.
            let pair_mask = b1 | b2;
            let mut removed = Vec::new();
            for &(r, col) in &cells_v1 {
                let m = c.get(r, col);
                let extra = m & !pair_mask;
                if extra == 0 {
                    continue;
                }
                for v in 1u8..=9 {
                    if extra & bit(v) != 0 {
                        removed.push((r, col, v));
                    }
                }
            }
            if !removed.is_empty() {
                return Some(Step::Elimination {
                    technique: tech,
                    removed,
                });
            }
        }
    }
    None
}

fn find_hidden_pair(c: &Candidates) -> Option<Step> {
    for r in 0..N {
        if let Some(s) = find_hidden_pair_unit(c, &row_cells(r), Technique::HiddenPairRow) {
            return Some(s);
        }
    }
    for col in 0..N {
        if let Some(s) = find_hidden_pair_unit(c, &col_cells(col), Technique::HiddenPairCol) {
            return Some(s);
        }
    }
    for b in 0..9 {
        if let Some(s) = find_hidden_pair_unit(c, &box_cells(b), Technique::HiddenPairBox) {
            return Some(s);
        }
    }
    None
}

// --- Tier 2: pointing pair/triple ----------------------------------------
//
// If in some box, all candidates for a digit lie in a single row (or column),
// then that digit cannot appear in the rest of that row/column.

fn find_pointing_pair(c: &Candidates) -> Option<Step> {
    for b in 0..9 {
        let cells = box_cells(b);
        let br = (b / 3) * 3;
        let bc = (b % 3) * 3;
        for v in 1u8..=9 {
            let mask = bit(v);
            let mut rows = [false; N];
            let mut cols = [false; N];
            let mut count = 0;
            for &(r, col) in &cells {
                if c.get(r, col) & mask != 0 {
                    rows[r] = true;
                    cols[col] = true;
                    count += 1;
                }
            }
            if count < 2 {
                continue;
            }
            // All in one row?
            let rows_used: Vec<usize> = (0..N).filter(|&r| rows[r]).collect();
            if rows_used.len() == 1 {
                let r = rows_used[0];
                let mut removed = Vec::new();
                for col in 0..N {
                    if col >= bc && col < bc + 3 {
                        continue;
                    }
                    if c.get(r, col) & mask != 0 {
                        removed.push((r, col, v));
                    }
                }
                if !removed.is_empty() {
                    return Some(Step::Elimination {
                        technique: Technique::PointingPair,
                        removed,
                    });
                }
            }
            // All in one col?
            let cols_used: Vec<usize> = (0..N).filter(|&c| cols[c]).collect();
            if cols_used.len() == 1 {
                let col = cols_used[0];
                let mut removed = Vec::new();
                for r in 0..N {
                    if r >= br && r < br + 3 {
                        continue;
                    }
                    if c.get(r, col) & mask != 0 {
                        removed.push((r, col, v));
                    }
                }
                if !removed.is_empty() {
                    return Some(Step::Elimination {
                        technique: Technique::PointingPair,
                        removed,
                    });
                }
            }
        }
    }
    None
}

// --- Tier 3: X-Wing -------------------------------------------------------
//
// For a digit v, find two rows in which v appears in exactly the same two
// columns. Then v must be in two of those four corners and cannot appear
// elsewhere in those two columns. Symmetric for columns.

fn find_xwing(c: &Candidates) -> Option<Step> {
    // Row-based X-Wing
    for v in 1u8..=9 {
        let mask = bit(v);
        // For each row, find cols where v is a candidate.
        let mut row_cols: Vec<Vec<usize>> = (0..N)
            .map(|r| {
                (0..N)
                    .filter(|&col| c.get(r, col) & mask != 0)
                    .collect()
            })
            .collect();
        for r1 in 0..N {
            if row_cols[r1].len() != 2 {
                continue;
            }
            let cols = row_cols[r1].clone();
            for r2 in (r1 + 1)..N {
                if row_cols[r2] != cols {
                    continue;
                }
                // X-Wing: eliminate v from cols `cols` in all other rows.
                let mut removed = Vec::new();
                for &col in &cols {
                    for r in 0..N {
                        if r == r1 || r == r2 {
                            continue;
                        }
                        if c.get(r, col) & mask != 0 {
                            removed.push((r, col, v));
                        }
                    }
                }
                if !removed.is_empty() {
                    return Some(Step::Elimination {
                        technique: Technique::XWingRow,
                        removed,
                    });
                }
            }
        }
        // Column-based X-Wing
        let col_rows: Vec<Vec<usize>> = (0..N)
            .map(|col| (0..N).filter(|&r| c.get(r, col) & mask != 0).collect())
            .collect();
        for c1 in 0..N {
            if col_rows[c1].len() != 2 {
                continue;
            }
            let rows = col_rows[c1].clone();
            for c2 in (c1 + 1)..N {
                if col_rows[c2] != rows {
                    continue;
                }
                let mut removed = Vec::new();
                for &r in &rows {
                    for col in 0..N {
                        if col == c1 || col == c2 {
                            continue;
                        }
                        if c.get(r, col) & mask != 0 {
                            removed.push((r, col, v));
                        }
                    }
                }
                if !removed.is_empty() {
                    return Some(Step::Elimination {
                        technique: Technique::XWingCol,
                        removed,
                    });
                }
            }
        }
        // Silence unused warning on `row_cols` after clone above.
        row_cols.clear();
    }
    None
}

// --- main loop ------------------------------------------------------------

/// Try techniques in ascending order of tier/cost. Apply the first that
/// produces progress.
fn try_step(c: &Candidates) -> Option<Step> {
    find_naked_single(c)
        .or_else(|| find_hidden_single(c))
        .or_else(|| find_naked_pair(c))
        .or_else(|| find_hidden_pair(c))
        .or_else(|| find_pointing_pair(c))
        .or_else(|| find_xwing(c))
}

fn apply(step: &Step, board: &mut Board, cands: &mut Candidates) {
    match step {
        Step::Placement { row, col, value, .. } => {
            board.set(*row, *col, *value);
            cands.fill(*row, *col, *value);
        }
        Step::Elimination { removed, .. } => {
            for &(r, c, v) in removed {
                let m = cands.get(r, c);
                cands.set(r, c, m & !bit(v));
            }
        }
    }
}

pub fn grade(board: &Board) -> GradeOutcome {
    let mut work = *board;
    let mut cands = Candidates::from_board(&work);
    let mut steps: Vec<Step> = Vec::new();
    let mut highest = Tier::T1Easy;

    loop {
        if work.is_complete() {
            return GradeOutcome::Solved {
                solution: work,
                steps,
                tier: highest,
            };
        }
        match try_step(&cands) {
            Some(step) => {
                let t = step.technique().tier();
                if t > highest {
                    highest = t;
                }
                apply(&step, &mut work, &mut cands);
                steps.push(step);
            }
            None => {
                return GradeOutcome::Stuck {
                    partial: work,
                    steps,
                };
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EASY: &str =
        "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";

    /// Inkala's "World's Hardest Sudoku". Should still be Stuck after T1–T3.
    const INKALA: &str =
        "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..";

    #[test]
    fn easy_still_easy() {
        let b = Board::from_str(EASY).unwrap();
        match grade(&b) {
            GradeOutcome::Solved { tier, .. } => assert_eq!(tier, Tier::T1Easy),
            other => panic!("expected Solved, got {:?}", other),
        }
    }

    #[test]
    fn inkala_still_stuck() {
        let b = Board::from_str(INKALA).unwrap();
        assert!(matches!(grade(&b), GradeOutcome::Stuck { .. }));
    }

    #[test]
    fn naked_single_step() {
        let mut b = Board::empty();
        for (col, v) in [1u8, 2, 3, 4, 6, 7, 8, 9].iter().enumerate() {
            let col_actual = if col >= 4 { col + 1 } else { col };
            b.set(0, col_actual, *v);
        }
        let c = Candidates::from_board(&b);
        let s = find_naked_single(&c).expect("should find naked single");
        match s {
            Step::Placement { row, col, value, .. } => assert_eq!((row, col, value), (0, 4, 5)),
            _ => panic!("expected placement"),
        }
    }
}
