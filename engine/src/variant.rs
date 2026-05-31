//! Variant abstraction: one engine, many sudoku rule-sets.
//!
//! A `Variant` is the full set of constraints that define how a 9×9 grid
//! must be filled. Classic = row + col + 3×3 box. Variants add or substitute:
//!
//! - **X-Sudoku**: both diagonals must contain 1..=9.
//! - **Jigsaw**: the 9 "boxes" are arbitrary connected 9-cell regions.
//! - **Killer**: cells are grouped into cages; each cage has a target sum
//!   and no digit repeats within it.

use crate::board::{box_dims, Board, CELLS, MAX_CELLS, N};

#[inline]
pub fn cell_index(r: usize, c: usize) -> usize {
    r * N + c
}

#[inline]
pub fn cell_index_n(n: usize, r: usize, c: usize) -> usize {
    r * n + c
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
    pub n: u8,
    pub box_h: u8,
    pub box_w: u8,
    /// `box_of[cell_index]` = which box this cell belongs to (0..n).
    pub box_of: [u8; MAX_CELLS],
    /// Cells of each box (inverse of `box_of`). `boxes[b]` lists the n cells.
    pub boxes: Vec<Vec<usize>>,
    pub diagonals: bool,
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
    #[inline]
    fn n(&self) -> usize {
        self.n as usize
    }

    pub fn classic() -> Self {
        Self::classic_n(9)
    }

    pub fn classic_n(n: usize) -> Self {
        let (bh, bw) = box_dims(n);
        let boxes_per_row = n / bw; // number of boxes spanning a row
        let mut box_of = [0u8; MAX_CELLS];
        let mut boxes: Vec<Vec<usize>> = vec![Vec::new(); n];
        for r in 0..n {
            for c in 0..n {
                let b = ((r / bh) * boxes_per_row + (c / bw)) as u8;
                let idx = cell_index_n(n, r, c);
                box_of[idx] = b;
                boxes[b as usize].push(idx);
            }
        }
        Variant {
            kind: VariantKind::Classic,
            n: n as u8,
            box_h: bh as u8,
            box_w: bw as u8,
            box_of,
            boxes,
            diagonals: false,
            cages: Vec::new(),
        }
    }

    pub fn xsudoku() -> Self {
        Self::xsudoku_n(9)
    }
    pub fn xsudoku_n(n: usize) -> Self {
        let mut v = Self::classic_n(n);
        v.kind = VariantKind::XSudoku;
        v.diagonals = true;
        v
    }

    // 9-default shim: generator passes a `[u8; CELLS]` (81). Copy into the
    // wider MAX_CELLS buffer and delegate.
    pub fn jigsaw(box_partition: [u8; CELLS]) -> Self {
        let mut big = [0u8; MAX_CELLS];
        big[..CELLS].copy_from_slice(&box_partition);
        Self::jigsaw_n(9, big)
    }
    pub fn jigsaw_n(n: usize, box_partition: [u8; MAX_CELLS]) -> Self {
        let (bh, bw) = box_dims(n);
        let mut boxes: Vec<Vec<usize>> = vec![Vec::new(); n];
        for i in 0..(n * n) {
            let b = box_partition[i] as usize;
            assert!(b < n, "box id out of range");
            assert!(boxes[b].len() < n, "box {b} has more than {n} cells");
            boxes[b].push(i);
        }
        for (b, cells) in boxes.iter().enumerate() {
            assert_eq!(cells.len(), n, "box {b} has only {} cells", cells.len());
        }
        Variant {
            kind: VariantKind::Jigsaw,
            n: n as u8,
            box_h: bh as u8,
            box_w: bw as u8,
            box_of: box_partition,
            boxes,
            diagonals: false,
            cages: Vec::new(),
        }
    }

    pub fn killer(cages: Vec<Cage>) -> Self {
        Self::killer_n(9, cages)
    }
    pub fn killer_n(n: usize, cages: Vec<Cage>) -> Self {
        let mut seen = vec![false; n * n];
        for cage in &cages {
            for &i in &cage.cells {
                assert!(!seen[i], "cell {i} in two cages");
                seen[i] = true;
            }
        }
        assert!(seen.iter().all(|&x| x), "cages do not cover all {} cells", n * n);
        let mut v = Self::classic_n(n);
        v.kind = VariantKind::Killer;
        v.cages = cages;
        v
    }

    pub fn box_idx(&self, r: usize, c: usize) -> usize {
        self.box_of[cell_index_n(self.n(), r, c)] as usize
    }

    /// Returns true if placing `v` at (r,c) violates row/col/box/diagonal/
    /// cage-uniqueness. (Killer cage *sums* are NOT enforced here — that
    /// requires partial-sum reasoning. The base solver still finds correct
    /// solutions because it tries digits and backtracks; the sum constraint
    /// is enforced as a final check via `is_solution_consistent`.)
    pub fn can_place(&self, board: &Board, r: usize, c: usize, v: u8) -> bool {
        for i in 0..self.n() {
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
                for i in 0..self.n() {
                    if board.get(i, i) == v {
                        return false;
                    }
                }
            }
            if r + c == self.n() - 1 {
                for i in 0..self.n() {
                    if board.get(i, self.n() - 1 - i) == v {
                        return false;
                    }
                }
            }
        }
        if !self.cages.is_empty() {
            let here = cell_index_n(self.n(), r, c);
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
                if remaining > self.n() as u32 * empty {
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
        for r in 0..self.n() {
            let mut seen = vec![false; self.n() + 1];
            for c in 0..self.n() {
                let v = board.get(r, c);
                if v == 0 || seen[v as usize] {
                    return false;
                }
                seen[v as usize] = true;
            }
        }
        // Cols
        for c in 0..self.n() {
            let mut seen = vec![false; self.n() + 1];
            for r in 0..self.n() {
                let v = board.get(r, c);
                if v == 0 || seen[v as usize] {
                    return false;
                }
                seen[v as usize] = true;
            }
        }
        // Custom boxes (jigsaw / classic)
        for b in 0..self.n() {
            let mut seen = vec![false; self.n() + 1];
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
            let mut seen1 = vec![false; self.n() + 1];
            let mut seen2 = vec![false; self.n() + 1];
            for i in 0..self.n() {
                let a = board.get(i, i);
                let b = board.get(i, self.n() - 1 - i);
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
            let mut seen = vec![false; self.n() + 1];
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
    fn classic_6x6_boxes_are_2x3() {
        let v = Variant::classic_n(6);
        assert_eq!(v.n, 6);
        // top-left 2x3 region is box 0
        for r in 0..2 {
            for c in 0..3 {
                assert_eq!(v.box_of[cell_index_n(6, r, c)], 0);
            }
        }
        // every box has exactly 6 cells
        assert_eq!(v.boxes.len(), 6);
        assert!(v.boxes.iter().all(|b| b.len() == 6));
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
