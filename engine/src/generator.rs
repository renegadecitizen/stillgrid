//! Puzzle generator.
//!
//! Strategy:
//!   1. Build a random *complete* solution that satisfies the variant.
//!   2. Carve clues by removing cells in random order, keeping each removal
//!      only if the remaining puzzle still has a unique solution.
//!
//! Classic, X-Sudoku, and Jigsaw all share the same pipeline. Killer is
//! handled separately (`generate_killer`) because it builds cages from a
//! completed grid rather than carving clues.

use crate::board::{Board, MAX_CELLS};
use crate::rng::Rng;
use crate::solver::{solve_variant, SolveOutcome};
use crate::techniques::{grade_variant, GradeOutcome};
use crate::variant::{Cage, Variant, VariantKind};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Puzzle {
    pub givens: Board,
    pub solution: Board,
    pub clue_count: usize,
    pub variant: Variant,
}

/// Build a random complete solution for a non-Killer variant. Returns None
/// on the (extremely rare) chance that no solution exists for the random
/// fill order (effectively never for classic/x/jigsaw with valid boxes).
pub fn random_solution(rng: &mut Rng, variant: &Variant) -> Option<Board> {
    let n = variant.n as usize;
    let mut b = Board::empty_n(n);
    if fill_random(&mut b, variant, rng) {
        Some(b)
    } else {
        None
    }
}

fn fill_random(board: &mut Board, variant: &Variant, rng: &mut Rng) -> bool {
    let n = variant.n as usize;
    let Some((r, c)) = first_empty(board, n) else {
        return true;
    };
    let mut digits: [u8; 16] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    rng.shuffle(&mut digits[..n]);
    for &v in &digits[..n] {
        if variant.can_place(board, r, c, v) {
            board.set(r, c, v);
            if fill_random(board, variant, rng) {
                return true;
            }
            board.set(r, c, 0);
        }
    }
    false
}

fn first_empty(board: &Board, n: usize) -> Option<(usize, usize)> {
    for r in 0..n {
        for c in 0..n {
            if board.get(r, c) == 0 {
                return Some((r, c));
            }
        }
    }
    None
}

/// Generate a unique-solution puzzle for the given variant.
/// For Killer use `generate_killer` instead — this function returns a
/// classic-style puzzle even if you pass a killer variant.
pub fn generate_variant(rng: &mut Rng, variant: &Variant, min_clues: usize) -> Puzzle {
    let n = variant.n as usize;
    let cells = n * n;
    let solution =
        random_solution(rng, variant).expect("solution always exists for non-degenerate variants");
    let mut givens = solution;

    let mut order: Vec<usize> = (0..cells).collect();
    rng.shuffle(&mut order);

    // On a 16×16 the backtracking uniqueness check degrades catastrophically
    // once givens fall below ~45% of cells (single checks blow past 10s), so
    // carving toward a near-minimal grid is computationally infeasible with the
    // current solver. Cap the carve at a board-size-scaled clue floor for n>9.
    // For n<=9 the natural carve depth is far below any such floor, so 9×9 (and
    // 6×6) behaviour is unchanged. See Task 5 perf notes; the dedicated 16×16
    // performance task may revisit this once the solver gains propagation.
    let floor = if n > 9 { min_clues.max(cells * 47 / 100) } else { min_clues };

    let mut clue_count = cells;
    for &idx in &order {
        if clue_count <= floor {
            break;
        }
        let saved = givens.0[idx];
        if saved == 0 {
            continue;
        }
        givens.0[idx] = 0;
        match solve_variant(&givens, variant) {
            SolveOutcome::Unique(_) => {
                clue_count -= 1;
            }
            _ => {
                givens.0[idx] = saved;
            }
        }
    }

    Puzzle { givens, solution, clue_count, variant: variant.clone() }
}

/// Backwards-compatible: classic generator.
pub fn generate(rng: &mut Rng, min_clues: usize) -> Puzzle {
    generate_variant(rng, &Variant::classic(), min_clues)
}

// --- Jigsaw partition generation -----------------------------------------
//
// Build a random partition of n*n cells into n connected regions of n.
// Uses BFS growth from n random seed cells; retries if a region gets boxed in.

pub fn random_jigsaw_variant_n(rng: &mut Rng, n: usize) -> Variant {
    loop {
        if let Some(partition) = try_jigsaw_partition(rng, n) {
            return Variant::jigsaw_n(n, partition);
        }
    }
}

/// 9-default shim.
pub fn random_jigsaw_variant(rng: &mut Rng) -> Variant {
    random_jigsaw_variant_n(rng, 9)
}

fn try_jigsaw_partition(rng: &mut Rng, n: usize) -> Option<[u8; MAX_CELLS]> {
    let cells = n * n;
    let mut partition = [u8::MAX; MAX_CELLS];
    let mut region_size = vec![0u8; n];

    // Seeds: n random distinct cells.
    let mut seeds: Vec<usize> = (0..cells).collect();
    rng.shuffle(&mut seeds);
    for (region, &seed) in seeds.iter().take(n).enumerate() {
        partition[seed] = region as u8;
        region_size[region] = 1;
    }

    // BFS frontier per region.
    let mut frontiers: Vec<Vec<usize>> =
        (0..n).map(|r| neighbours(seeds[r], n).into_iter().collect()).collect();

    let mut placed = n;
    while placed < cells {
        let mut made_progress = false;
        let mut order: Vec<usize> = (0..n).collect();
        rng.shuffle(&mut order);
        for &region in &order {
            if region_size[region] as usize >= n {
                continue;
            }
            // Find an unassigned frontier cell.
            while let Some(cell) = frontiers[region].pop() {
                if partition[cell] != u8::MAX {
                    continue;
                }
                partition[cell] = region as u8;
                region_size[region] += 1;
                placed += 1;
                made_progress = true;
                for nb in neighbours(cell, n) {
                    if partition[nb] == u8::MAX {
                        frontiers[region].push(nb);
                    }
                }
                break;
            }
        }
        if !made_progress {
            return None;
        }
    }
    Some(partition)
}

fn neighbours(cell: usize, n: usize) -> Vec<usize> {
    let r = cell / n;
    let c = cell % n;
    let mut out = Vec::with_capacity(4);
    if r > 0 {
        out.push(cell - n);
    }
    if r < n - 1 {
        out.push(cell + n);
    }
    if c > 0 {
        out.push(cell - 1);
    }
    if c < n - 1 {
        out.push(cell + 1);
    }
    out
}

// --- Killer cage generation ----------------------------------------------
//
// 1. Build a random classic-rules complete solution.
// 2. Partition cells into orthogonally connected cages (size 2..=4).
// 3. Sum is the literal sum of digits in each cage.
// 4. The givens board is *empty* — Killer puzzles ship with no digit clues,
//    only cages and sums.

pub fn generate_killer_n(rng: &mut Rng, n: usize) -> Puzzle {
    let cells = n * n;
    let classic = Variant::classic_n(n);
    let solution = random_solution(rng, &classic).expect("classic solution");

    let cages = partition_into_cages(rng, &solution, n);
    let variant = Variant::killer_n(n, cages);

    // A random cage partition almost never pins a unique solution on its own
    // (empirically ~85% of partitions are ambiguous). Carve from the fully
    // revealed grid, dropping each cell only while the puzzle stays solvable by
    // the technique grader. Grading with sound techniques only makes forced
    // moves, so a fully-graded grid is necessarily unique — this gives both
    // uniqueness *and* a guarantee the app never ships a stuck killer. Cleanly
    // constrained layouts carve all the way to zero givens; the rest keep the
    // minimum clues the technique set needs.
    let mut givens = solution;
    let mut order: Vec<usize> = (0..cells).collect();
    rng.shuffle(&mut order);
    let mut clue_count = cells;
    for &idx in &order {
        let saved = givens.0[idx];
        givens.0[idx] = 0;
        match grade_variant(&givens, &variant) {
            GradeOutcome::Solved { .. } => clue_count -= 1,
            _ => givens.0[idx] = saved,
        }
    }

    Puzzle { givens, solution, clue_count, variant }
}

/// 9-default shim.
pub fn generate_killer(rng: &mut Rng) -> Puzzle {
    generate_killer_n(rng, 9)
}

fn partition_into_cages(rng: &mut Rng, solution: &Board, n: usize) -> Vec<Cage> {
    let total = n * n;
    let mut assigned = vec![false; total];
    let mut cages: Vec<Cage> = Vec::new();
    let mut order: Vec<usize> = (0..total).collect();
    rng.shuffle(&mut order);

    for &start in &order {
        if assigned[start] {
            continue;
        }
        // Cage size: 2, 3, or 4 (with mild bias toward 3), never exceeding n.
        let target = match rng.gen_range(10) {
            0..=2 => 2,
            3..=7 => 3,
            _ => 4,
        }
        .min(n);
        let mut cells = vec![start];
        assigned[start] = true;
        let mut frontier = neighbours(start, n);

        while cells.len() < target && !frontier.is_empty() {
            let i = rng.gen_range(frontier.len());
            let cell = frontier.remove(i);
            if assigned[cell] {
                continue;
            }
            // Must not duplicate any digit already in the cage (cage uniqueness).
            let v = solution.0[cell];
            if cells.iter().any(|&c| solution.0[c] == v) {
                continue;
            }
            assigned[cell] = true;
            cells.push(cell);
            for nb in neighbours(cell, n) {
                if !assigned[nb] {
                    frontier.push(nb);
                }
            }
        }

        // Sum
        let sum: u32 = cells.iter().map(|&c| solution.0[c] as u32).sum();
        cages.push(Cage { cells, sum });
    }

    // Any orphan single-cell "cages" (rare, when neighbours all got grabbed
    // by other cages before this one started) just stand alone with their
    // value as the sum — which makes them a free clue, fine for v1.
    cages
}

// --- variant dispatch -----------------------------------------------------

pub fn generate_for_n(rng: &mut Rng, n: usize, kind: VariantKind, min_clues: usize) -> Puzzle {
    match kind {
        VariantKind::Classic => generate_variant(rng, &Variant::classic_n(n), min_clues),
        VariantKind::XSudoku => generate_variant(rng, &Variant::xsudoku_n(n), min_clues),
        VariantKind::Jigsaw => {
            let v = random_jigsaw_variant_n(rng, n);
            generate_variant(rng, &v, min_clues)
        }
        VariantKind::Killer => generate_killer_n(rng, n),
    }
}

/// 9-default shim.
pub fn generate_for(rng: &mut Rng, kind: VariantKind, min_clues: usize) -> Puzzle {
    generate_for_n(rng, 9, kind, min_clues)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classic_solution_consistent() {
        let mut rng = Rng::new(1);
        let s = random_solution(&mut rng, &Variant::classic()).unwrap();
        assert!(Variant::classic().is_solution_consistent(&s));
    }

    #[test]
    fn classic_puzzle_unique() {
        let mut rng = Rng::new(42);
        let p = generate_variant(&mut rng, &Variant::classic(), 28);
        match solve_variant(&p.givens, &p.variant) {
            SolveOutcome::Unique(s) => assert_eq!(s, p.solution),
            other => panic!("expected unique, got {:?}", other),
        }
    }

    #[test]
    fn xsudoku_solution_respects_diagonals() {
        let mut rng = Rng::new(7);
        let p = generate_variant(&mut rng, &Variant::xsudoku(), 32);
        assert!(p.variant.is_solution_consistent(&p.solution));
        // Spot-check: both diagonals contain all 9 digits.
        let mut d1 = [false; 10];
        let mut d2 = [false; 10];
        for i in 0..9 {
            d1[p.solution.get(i, i) as usize] = true;
            d2[p.solution.get(i, 8 - i) as usize] = true;
        }
        for v in 1..=9 {
            assert!(d1[v]);
            assert!(d2[v]);
        }
    }

    #[test]
    fn jigsaw_partition_covers_grid() {
        let mut rng = Rng::new(3);
        let v = random_jigsaw_variant(&mut rng);
        let mut counts = [0u32; 9];
        for i in 0..81 {
            counts[v.box_of[i] as usize] += 1;
        }
        for c in counts {
            assert_eq!(c, 9);
        }
    }

    #[test]
    fn killer_cages_partition_grid() {
        let mut rng = Rng::new(11);
        let p = generate_killer(&mut rng);
        let mut covered = 0;
        for cage in &p.variant.cages {
            covered += cage.cells.len();
            // No duplicate digits in cage
            let mut seen = [false; 10];
            for &c in &cage.cells {
                let v = p.solution.0[c];
                assert!(!seen[v as usize], "duplicate in cage: {v}");
                seen[v as usize] = true;
            }
            // Sum matches digits
            let sum: u32 = cage.cells.iter().map(|&c| p.solution.0[c] as u32).sum();
            assert_eq!(sum, cage.sum);
        }
        assert_eq!(covered, 81);
    }

    #[test]
    fn generate_variant_6_and_16_unique() {
        use crate::solver::{solve_variant, SolveOutcome};
        let mut rng = Rng::new(7);
        for &n in &[6usize, 16usize] {
            let v = Variant::classic_n(n);
            let p = generate_variant(&mut rng, &v, 0);
            // givens is an n×n board; its dotted form round-trips to length n*n.
            let b = Board::from_str(&p.givens.to_string_dotted()).unwrap();
            assert_eq!(b.n(), n);
            assert!(matches!(solve_variant(&b, &v), SolveOutcome::Unique(_)), "n={n} not unique");
        }
    }
}
