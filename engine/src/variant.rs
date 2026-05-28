//! Variant abstraction: one engine, many sudoku rule-sets.
//!
//! A `Variant` is the full set of constraints that define how a 9×9 grid
//! must be filled. Classic = row + col + 3×3 box. Variants add or substitute:
//!
//! - **X-Sudoku**: both diagonals must contain 1..=9.
//! - **Jigsaw**: the 9 "boxes" are arbitrary connected 9-cell regions.
//! - **Killer**: cells are grouped into cages; each cage has a target sum
//!   and no digit repeats within it.
//!
//! Mini 6×6 and 16×16 require generalizing the `N=9` constant across the
//! engine and are deferred to a separate refactor.

use crate::board::{Board, CELLS, N};

#[inline]
pub fn cell_index(r: usize, c: usize) -> usize {
    r * N + c
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Cage {
    /// Cell indices (0..81) belonging to this cage.
    pub cells: Vec<usize>,
    /// Target sum.
    pub sum: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Variant {
    pub kind: VariantKind,
    /// `box_of[cell_index]` = which of the 9 boxes this cell belongs to (0..9).
    /// Classic = standard 3×3. Jigsaw = arbitrary partition.
    pub box_of: [u8; CELLS],
    /// Cells of each box (inverse of `box_of`). `boxes[b]` lists the 9 cells.
    pub boxes: [[usize; 9]; 9],
    /// X-Sudoku flag — both main diagonals are additional unique units.
    pub diagonals: bool,
    /// Killer cages (empty for non-Killer variants).
    pub cages: Vec<Cage>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum VariantKind {
    Classic,
    XSudoku,
    Jigsaw,
    Killer,
}

impl VariantKind {
    pub fn as_str(self) -> &'static str {
        match self {
            VariantKind::Classic => "classic",
            VariantKind::XSudoku => "xsudoku",
            VariantKind::Jigsaw => "jigsaw",
            VariantKind::Killer => "killer",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "classic" => Some(VariantKind::Classic),
            "xsudoku" | "x-sudoku" | "x" => Some(VariantKind::XSudoku),
            "jigsaw" | "irregular" => Some(VariantKind::Jigsaw),
            "killer" => Some(VariantKind::Killer),
            _ => None,
        }
    }
}

impl Variant {
    /// The standard classic sudoku rules.
    pub fn classic() -> Self {
        let mut box_of = [0u8; CELLS];
        let mut boxes = [[0usize; 9]; 9];
        let mut counts = [0usize; 9];
        for r in 0..N {
            for c in 0..N {
                let b = ((r / 3) * 3 + (c / 3)) as u8;
                box_of[cell_index(r, c)] = b;
                let idx = counts[b as usize];
                boxes[b as usize][idx] = cell_index(r, c);
                counts[b as usize] += 1;
            }
        }
        Variant { kind: VariantKind::Classic, box_of, boxes, diagonals: false, cages: Vec::new() }
    }

    /// Classic rules plus both diagonals.
    pub fn xsudoku() -> Self {
        let mut v = Self::classic();
        v.kind = VariantKind::XSudoku;
        v.diagonals = true;
        v
    }

    /// Build a variant from a 9×9 partition map. `box_partition[r*9+c]` must
    /// be in 0..9 and every box must contain exactly 9 cells.
    pub fn jigsaw(box_partition: [u8; CELLS]) -> Self {
        let mut boxes = [[0usize; 9]; 9];
        let mut counts = [0usize; 9];
        for (i, &bp) in box_partition.iter().enumerate() {
            let b = bp as usize;
            assert!(b < 9, "box id out of range");
            assert!(counts[b] < 9, "box {b} has more than 9 cells");
            boxes[b][counts[b]] = i;
            counts[b] += 1;
        }
        for (b, &c) in counts.iter().enumerate() {
            assert_eq!(c, 9, "box {b} has only {c} cells");
        }
        Variant {
            kind: VariantKind::Jigsaw,
            box_of: box_partition,
            boxes,
            diagonals: false,
            cages: Vec::new(),
        }
    }

    /// Classic boxes plus killer cages. `cages` must partition the 81 cells.
    pub fn killer(cages: Vec<Cage>) -> Self {
        let mut seen = [false; CELLS];
        for cage in &cages {
            for &i in &cage.cells {
                assert!(!seen[i], "cell {i} in two cages");
                seen[i] = true;
            }
        }
        assert!(seen.iter().all(|&x| x), "cages do not cover all 81 cells");
        let mut v = Self::classic();
        v.kind = VariantKind::Killer;
        v.cages = cages;
        v
    }

    pub fn box_idx(&self, r: usize, c: usize) -> usize {
        self.box_of[cell_index(r, c)] as usize
    }

    /// Returns true if placing `v` at (r,c) violates row/col/box/diagonal/
    /// cage-uniqueness. (Killer cage *sums* are NOT enforced here — that
    /// requires partial-sum reasoning. The base solver still finds correct
    /// solutions because it tries digits and backtracks; the sum constraint
    /// is enforced as a final check via `is_solution_consistent`.)
    pub fn can_place(&self, board: &Board, r: usize, c: usize, v: u8) -> bool {
        for i in 0..N {
            if board.get(r, i) == v || board.get(i, c) == v {
                return false;
            }
        }
        let b = self.box_idx(r, c);
        for &idx in &self.boxes[b] {
            let bv = board.0[idx];
            if bv == v {
                return false;
            }
        }
        if self.diagonals {
            if r == c {
                for i in 0..N {
                    if board.get(i, i) == v {
                        return false;
                    }
                }
            }
            if r + c == N - 1 {
                for i in 0..N {
                    if board.get(i, N - 1 - i) == v {
                        return false;
                    }
                }
            }
        }
        if !self.cages.is_empty() {
            let here = cell_index(r, c);
            for cage in &self.cages {
                if !cage.cells.contains(&here) {
                    continue;
                }
                // Uniqueness within cage.
                for &idx in &cage.cells {
                    if idx == here {
                        continue;
                    }
                    if board.0[idx] == v {
                        return false;
                    }
                }
                // Partial sum guard: if placing v makes filled-sum > target,
                // OR makes (remaining empty cells) impossible to close to
                // the target, reject.
                let mut filled_sum = v as u32;
                let mut empty = 0u32;
                for &idx in &cage.cells {
                    if idx == here {
                        continue;
                    }
                    let bv = board.0[idx];
                    if bv == 0 {
                        empty += 1;
                    } else {
                        filled_sum += bv as u32;
                    }
                }
                if filled_sum > cage.sum {
                    return false;
                }
                // Each empty cell can hold at minimum 1 and max 9.
                let remaining = cage.sum.saturating_sub(filled_sum);
                if remaining < empty {
                    return false;
                }
                if remaining > 9 * empty {
                    return false;
                }
            }
        }
        true
    }

    /// Final-check: every filled cell respects all constraints, including
    /// cage-sum equality. Used by the generator before accepting a solution.
    ///
    /// Checks rows + cols + this variant's boxes + diagonals + cages.
    /// Crucially does NOT call `Board::is_consistent` because that hardcodes
    /// 3×3 boxes and would reject valid jigsaw solutions.
    pub fn is_solution_consistent(&self, board: &Board) -> bool {
        // Rows
        for r in 0..N {
            let mut seen = [false; 10];
            for c in 0..N {
                let v = board.get(r, c);
                if v == 0 || seen[v as usize] {
                    return false;
                }
                seen[v as usize] = true;
            }
        }
        // Cols
        for c in 0..N {
            let mut seen = [false; 10];
            for r in 0..N {
                let v = board.get(r, c);
                if v == 0 || seen[v as usize] {
                    return false;
                }
                seen[v as usize] = true;
            }
        }
        // Custom boxes (jigsaw / classic)
        for b in 0..9 {
            let mut seen = [false; 10];
            for &idx in &self.boxes[b] {
                let v = board.0[idx];
                if v == 0 {
                    return false;
                }
                if seen[v as usize] {
                    return false;
                }
                seen[v as usize] = true;
            }
        }
        // Diagonals
        if self.diagonals {
            let mut seen1 = [false; 10];
            let mut seen2 = [false; 10];
            for i in 0..N {
                let a = board.get(i, i);
                let b = board.get(i, N - 1 - i);
                if a == 0 || b == 0 || seen1[a as usize] || seen2[b as usize] {
                    return false;
                }
                seen1[a as usize] = true;
                seen2[b as usize] = true;
            }
        }
        // Cages
        for cage in &self.cages {
            let mut sum = 0u32;
            let mut seen = [false; 10];
            for &idx in &cage.cells {
                let v = board.0[idx];
                if v == 0 || seen[v as usize] {
                    return false;
                }
                seen[v as usize] = true;
                sum += v as u32;
            }
            if sum != cage.sum {
                return false;
            }
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classic_box_partition_is_standard_3x3() {
        let v = Variant::classic();
        // Top-left 3x3 is box 0
        for r in 0..3 {
            for c in 0..3 {
                assert_eq!(v.box_of[cell_index(r, c)], 0);
            }
        }
        // Center 3x3 is box 4
        for r in 3..6 {
            for c in 3..6 {
                assert_eq!(v.box_of[cell_index(r, c)], 4);
            }
        }
    }

    #[test]
    fn xsudoku_diagonals_enforced() {
        let v = Variant::xsudoku();
        let mut b = Board::empty();
        b.set(0, 0, 5);
        assert!(!v.can_place(&b, 4, 4, 5)); // same diagonal
        assert!(v.can_place(&b, 4, 5, 5)); // off-diagonal, different row/col/box
    }

    #[test]
    fn killer_cage_uniqueness_and_sum() {
        // Make 81 single-cell cages, each with sum being whatever digit must go there.
        // Use a degenerate variant just to test plumbing.
        let cages: Vec<Cage> = (0..81).map(|i| Cage { cells: vec![i], sum: 5 }).collect();
        let v = Variant::killer(cages);
        let b = Board::empty();
        // Any non-5 fails the sum guard.
        assert!(!v.can_place(&b, 0, 0, 1));
        // 5 succeeds the cage sum.
        assert!(v.can_place(&b, 0, 0, 5));
    }
}
