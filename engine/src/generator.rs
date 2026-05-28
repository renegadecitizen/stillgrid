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

use crate::board::{Board, CELLS, N};
use crate::rng::Rng;
use crate::solver::{solve_variant, SolveOutcome};
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
    let mut b = Board::empty();
    if fill_random(&mut b, variant, rng) {
        Some(b)
    } else {
        None
    }
}

fn fill_random(board: &mut Board, variant: &Variant, rng: &mut Rng) -> bool {
    let Some((r, c)) = first_empty(board) else {
        return true;
    };
    let mut digits: [u8; 9] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    rng.shuffle(&mut digits);
    for &v in &digits {
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

fn first_empty(board: &Board) -> Option<(usize, usize)> {
    for r in 0..N {
        for c in 0..N {
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
    let solution =
        random_solution(rng, variant).expect("solution always exists for non-degenerate variants");
    let mut givens = solution;

    let mut order: Vec<usize> = (0..CELLS).collect();
    rng.shuffle(&mut order);

    let mut clue_count = CELLS;
    for &idx in &order {
        if clue_count <= min_clues {
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
// Build a random partition of 81 cells into 9 connected regions of 9.
// Uses BFS growth from 9 random seed cells, then assigns the rest greedily.

pub fn random_jigsaw_variant(rng: &mut Rng) -> Variant {
    loop {
        if let Some(partition) = try_jigsaw_partition(rng) {
            return Variant::jigsaw(partition);
        }
    }
}

fn try_jigsaw_partition(rng: &mut Rng) -> Option<[u8; CELLS]> {
    let mut partition = [u8::MAX; CELLS];
    let mut region_size = [0u8; 9];

    // Seeds: 9 random distinct cells.
    let mut seeds: Vec<usize> = (0..CELLS).collect();
    rng.shuffle(&mut seeds);
    for (region, &seed) in seeds.iter().take(9).enumerate() {
        partition[seed] = region as u8;
        region_size[region] = 1;
    }

    // BFS frontier per region.
    let mut frontiers: Vec<Vec<usize>> =
        (0..9).map(|r| neighbours(seeds[r]).into_iter().collect()).collect();

    let mut placed = 9;
    while placed < CELLS {
        let mut made_progress = false;
        let mut order: Vec<usize> = (0..9).collect();
        rng.shuffle(&mut order);
        for &region in &order {
            if region_size[region] >= 9 {
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
                for n in neighbours(cell) {
                    if partition[n] == u8::MAX {
                        frontiers[region].push(n);
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

fn neighbours(cell: usize) -> Vec<usize> {
    let r = cell / N;
    let c = cell % N;
    let mut out = Vec::with_capacity(4);
    if r > 0 {
        out.push(cell - N);
    }
    if r < N - 1 {
        out.push(cell + N);
    }
    if c > 0 {
        out.push(cell - 1);
    }
    if c < N - 1 {
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

pub fn generate_killer(rng: &mut Rng) -> Puzzle {
    let classic = Variant::classic();
    let solution = random_solution(rng, &classic).expect("classic solution");

    let cages = partition_into_cages(rng, &solution);
    let variant = Variant::killer(cages);

    Puzzle { givens: Board::empty(), solution, clue_count: 0, variant }
}

fn partition_into_cages(rng: &mut Rng, solution: &Board) -> Vec<Cage> {
    let mut assigned = [false; CELLS];
    let mut cages: Vec<Cage> = Vec::new();
    let mut order: Vec<usize> = (0..CELLS).collect();
    rng.shuffle(&mut order);

    for &start in &order {
        if assigned[start] {
            continue;
        }
        // Cage size: 2, 3, or 4 (with mild bias toward 3).
        let target = match rng.gen_range(10) {
            0..=2 => 2,
            3..=7 => 3,
            _ => 4,
        };
        let mut cells = vec![start];
        assigned[start] = true;
        let mut frontier = neighbours(start);

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
            for n in neighbours(cell) {
                if !assigned[n] {
                    frontier.push(n);
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

pub fn generate_for(rng: &mut Rng, kind: VariantKind, min_clues: usize) -> Puzzle {
    match kind {
        VariantKind::Classic => generate_variant(rng, &Variant::classic(), min_clues),
        VariantKind::XSudoku => generate_variant(rng, &Variant::xsudoku(), min_clues),
        VariantKind::Jigsaw => {
            let v = random_jigsaw_variant(rng);
            generate_variant(rng, &v, min_clues)
        }
        VariantKind::Killer => generate_killer(rng),
    }
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
        for i in 0..CELLS {
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
        assert_eq!(covered, CELLS);
    }
}
