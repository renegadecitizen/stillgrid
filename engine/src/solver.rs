//! Backtracking solver with uniqueness check, parameterized by Variant.

use crate::board::{Board, MAX_CELLS};
use crate::variant::Variant;

/// Per-solve immutable context: variant + precomputed peer lists.
#[allow(dead_code)]
struct SolveCtx<'a> {
    variant: &'a Variant,
    n: usize,
    has_cages: bool,
    /// peers[cell] = every other cell sharing a unit (row/col/box/diag) with it.
    peers: Vec<Vec<usize>>,
}

impl<'a> SolveCtx<'a> {
    fn new(variant: &'a Variant, n: usize) -> Self {
        let cells = n * n;
        let mut peers: Vec<Vec<usize>> = vec![Vec::new(); cells];
        for (i, set) in peers.iter_mut().enumerate() {
            let r = i / n;
            let c = i % n;
            // Row + column.
            for k in 0..n {
                let row_cell = r * n + k;
                if row_cell != i {
                    set.push(row_cell);
                }
                let col_cell = k * n + c;
                if col_cell != i {
                    set.push(col_cell);
                }
            }
            // Box (variant-defined; covers jigsaw + classic).
            let b = variant.box_idx(r, c);
            for &idx in &variant.boxes[b] {
                if idx != i {
                    set.push(idx);
                }
            }
            // Diagonals (X-Sudoku).
            if variant.diagonals {
                if r == c {
                    for k in 0..n {
                        let d = k * n + k;
                        if d != i {
                            set.push(d);
                        }
                    }
                }
                if r + c == n - 1 {
                    for k in 0..n {
                        let d = k * n + (n - 1 - k);
                        if d != i {
                            set.push(d);
                        }
                    }
                }
            }
            set.sort_unstable();
            set.dedup();
        }
        SolveCtx { variant, n, has_cages: !variant.cages.is_empty(), peers }
    }
}

// `Board` is a fixed 257-byte buffer (MAX_CELLS + n). The size gap vs the unit
// variants trips clippy's large_enum_variant, but boxing is pointless here:
// a SolveOutcome is produced once per solve and matched immediately, never
// stored in bulk — the indirection would cost more than the stack copy saves.
#[allow(clippy::large_enum_variant)]
#[derive(Debug, PartialEq, Eq)]
pub enum SolveOutcome {
    Unique(Board),
    Multiple,
    Unsolvable,
}

/// Classic solve (shortcut for Variant::classic()).
pub fn solve(board: &Board) -> SolveOutcome {
    solve_variant(board, &Variant::classic())
}

pub fn solve_variant(board: &Board, variant: &Variant) -> SolveOutcome {
    if !variant.is_partial_consistent(board) {
        return SolveOutcome::Unsolvable;
    }
    let n = board.n();
    let ctx = SolveCtx::new(variant, n);
    let mut work = *board;
    let mut cand = [0u32; MAX_CELLS];
    seed_masks(&work, &ctx, &mut cand);
    let mut found: Option<Board> = None;
    let mut count = 0u32;
    search(&mut work, &mut cand, &ctx, &mut found, &mut count, 2);
    match count {
        0 => SolveOutcome::Unsolvable,
        1 => SolveOutcome::Unique(found.unwrap()),
        _ => SolveOutcome::Multiple,
    }
}

/// For every empty cell, mask = digits not present among its peers.
fn seed_masks(board: &Board, ctx: &SolveCtx, cand: &mut [u32; MAX_CELLS]) {
    let cells = ctx.n * ctx.n;
    // n <= MAX_N (16) < 32, so the shift never overflows a u32.
    let full: u32 = (1u32 << ctx.n) - 1;
    for (i, slot) in cand.iter_mut().enumerate().take(cells) {
        if board.0[i] != 0 {
            *slot = 0;
            continue;
        }
        let mut m = full;
        for &p in &ctx.peers[i] {
            let pv = board.0[p];
            if pv != 0 {
                m &= !(1u32 << (pv - 1));
            }
        }
        *slot = m;
    }
}

/// Assign `v` at `cell`, eliminate from peers, and cascade naked singles.
/// Returns false on contradiction (an empty cell with no candidates).
fn assign_and_propagate(
    board: &mut Board,
    cand: &mut [u32; MAX_CELLS],
    ctx: &SolveCtx,
    cell: usize,
    v: u8,
) -> bool {
    let mut stack: Vec<(usize, u8)> = vec![(cell, v)];
    while let Some((c0, v0)) = stack.pop() {
        if board.0[c0] != 0 {
            continue; // already filled by an earlier cascade step
        }
        board.0[c0] = v0;
        cand[c0] = 0;
        let bit = 1u32 << (v0 - 1);
        for &p in &ctx.peers[c0] {
            if board.0[p] != 0 {
                continue;
            }
            if cand[p] & bit == 0 {
                continue;
            }
            let after = cand[p] & !bit;
            cand[p] = after;
            if after == 0 {
                return false; // peer has no candidates -> dead branch
            }
            if after.count_ones() == 1 {
                let fv = (after.trailing_zeros() + 1) as u8;
                // This cage check can go stale before the cell is popped and
                // assigned (a later cascade step may fill a cage peer first);
                // the full-board `is_solution_consistent` at the search leaf
                // re-verifies cage sums, so the invariant holds end-to-end.
                if ctx.has_cages && !ctx.variant.can_place(board, p / ctx.n, p % ctx.n, fv) {
                    return false; // forced single violates cage sum
                }
                stack.push((p, fv));
            }
        }
    }
    true
}

/// Minimum-remaining-values branch cell. Returns the empty cell with the
/// fewest candidates and its mask; a returned mask of 0 means a dead end
/// (the branch loop will try no candidates and prune).
fn find_branch_cell(board: &Board, cand: &[u32; MAX_CELLS], cells: usize) -> Option<(usize, u32)> {
    let mut best: Option<(usize, u32, u32)> = None; // (cell, mask, popcount)
    for (i, &m) in cand.iter().enumerate().take(cells) {
        if board.0[i] != 0 {
            continue;
        }
        let pc = m.count_ones();
        if pc == 0 {
            return Some((i, 0));
        }
        match best {
            Some((_, _, bpc)) if bpc <= pc => {}
            _ => best = Some((i, m, pc)),
        }
        if pc == 1 {
            return Some((i, m));
        }
    }
    best.map(|(i, m, _)| (i, m))
}

fn search(
    board: &mut Board,
    cand: &mut [u32; MAX_CELLS],
    ctx: &SolveCtx,
    found: &mut Option<Board>,
    count: &mut u32,
    limit: u32,
) {
    if *count >= limit {
        return;
    }
    let cells = ctx.n * ctx.n;
    let Some((cell, mask)) = find_branch_cell(board, cand, cells) else {
        // No empty cell remains -> full board. Verify (catches cage sums).
        if ctx.variant.is_solution_consistent(board) {
            *count += 1;
            if found.is_none() {
                *found = Some(*board);
            }
        }
        return;
    };
    let mut bits = mask;
    while bits != 0 {
        let v = (bits.trailing_zeros() + 1) as u8;
        bits &= bits - 1;
        if ctx.has_cages && !ctx.variant.can_place(board, cell / ctx.n, cell % ctx.n, v) {
            continue;
        }
        let saved_board = *board;
        let saved_cand = *cand;
        if assign_and_propagate(board, cand, ctx, cell, v) {
            search(board, cand, ctx, found, count, limit);
        }
        *board = saved_board;
        *cand = saved_cand;
        if *count >= limit {
            return;
        }
    }
}

impl Variant {
    /// Like `is_solution_consistent` but allows empty cells. Pre-flight
    /// check before recursive search starts.
    pub fn is_partial_consistent(&self, board: &Board) -> bool {
        // Standard row/col/box uniqueness across whatever digits are present.
        let n = board.n();
        for r in 0..n {
            for c in 0..n {
                let v = board.get(r, c);
                if v == 0 {
                    continue;
                }
                if !self.can_place_ignoring_self(board, r, c, v) {
                    return false;
                }
            }
        }
        true
    }

    fn can_place_ignoring_self(&self, board: &Board, r: usize, c: usize, v: u8) -> bool {
        let mut tmp = *board;
        tmp.set(r, c, 0);
        self.can_place(&tmp, r, c, v)
    }
}

#[cfg(test)]
pub(crate) mod naive {
    //! Frozen copy of the pre-propagation solver. Kept permanently as the
    //! differential oracle proving the propagating solver is equivalent.
    use super::SolveOutcome;
    use crate::board::Board;
    use crate::variant::Variant;

    pub fn solve_variant_naive(board: &Board, variant: &Variant) -> SolveOutcome {
        if !variant.is_partial_consistent(board) {
            return SolveOutcome::Unsolvable;
        }
        let mut work = *board;
        let mut found: Option<Board> = None;
        let mut count = 0u32;
        search(&mut work, variant, &mut found, &mut count, 2);
        match count {
            0 => SolveOutcome::Unsolvable,
            1 => SolveOutcome::Unique(found.unwrap()),
            _ => SolveOutcome::Multiple,
        }
    }

    fn search(
        board: &mut Board,
        variant: &Variant,
        found: &mut Option<Board>,
        count: &mut u32,
        limit: u32,
    ) {
        if *count >= limit {
            return;
        }
        let Some((r, c, candidates)) = find_empty_min_options(board, variant) else {
            if variant.is_solution_consistent(board) {
                *count += 1;
                if found.is_none() {
                    *found = Some(*board);
                }
            }
            return;
        };
        for v in candidates {
            board.set(r, c, v);
            search(board, variant, found, count, limit);
            board.set(r, c, 0);
            if *count >= limit {
                return;
            }
        }
    }

    fn find_empty_min_options(board: &Board, variant: &Variant) -> Option<(usize, usize, Vec<u8>)> {
        let n = board.n();
        let mut best: Option<(usize, usize, Vec<u8>)> = None;
        for r in 0..n {
            for c in 0..n {
                if board.get(r, c) != 0 {
                    continue;
                }
                let n_max = u8::try_from(n).expect("board size fits in u8");
                let opts: Vec<u8> =
                    (1u8..=n_max).filter(|&v| variant.can_place(board, r, c, v)).collect();
                if opts.is_empty() {
                    return Some((r, c, opts));
                }
                let count = opts.len();
                match &best {
                    Some((_, _, bo)) if bo.len() <= count => {}
                    _ => best = Some((r, c, opts)),
                }
                if count == 1 {
                    return best;
                }
            }
        }
        best
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generator::generate_for_n;
    use crate::rng::Rng;
    use crate::variant::VariantKind;

    const EASY: &str =
        "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
    const EASY_SOLN: &str =
        "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

    #[test]
    fn solves_easy() {
        let b = Board::from_str(EASY).unwrap();
        match solve(&b) {
            SolveOutcome::Unique(s) => assert_eq!(s.to_string_dotted(), EASY_SOLN),
            other => panic!("expected unique, got {:?}", other),
        }
    }

    #[test]
    fn detects_multiple_solutions() {
        let b = Board::empty();
        assert_eq!(solve(&b), SolveOutcome::Multiple);
    }

    #[test]
    fn detects_unsolvable() {
        let mut b = Board::empty();
        b.set(0, 0, 5);
        b.set(0, 1, 5);
        assert_eq!(solve(&b), SolveOutcome::Unsolvable);
    }

    // A known-valid 6×6 classic solution (2×3 boxes), rows concatenated.
    const SOLVED6: &str = "123456456123231564564231312645645312";

    #[test]
    fn solves_6x6_uniquely() {
        let v = Variant::classic_n(6);
        // Blank the main diagonal: each blanked cell is the only empty in its row,
        // so the completion is forced and unique — equals SOLVED6.
        let mut b = Board::from_str(SOLVED6).unwrap();
        for i in 0..6 {
            b.set(i, i, 0);
        }
        match solve_variant(&b, &v) {
            SolveOutcome::Unique(s) => assert_eq!(s.to_string_dotted(), SOLVED6),
            other => panic!("expected unique, got {:?}", other),
        }
    }

    #[test]
    fn empty_6x6_has_multiple() {
        let v = Variant::classic_n(6);
        assert_eq!(solve_variant(&Board::empty_n(6), &v), SolveOutcome::Multiple);
    }

    #[test]
    fn propagating_solver_solves_easy() {
        // Reuses EASY / EASY_SOLN constants already in this module.
        let b = Board::from_str(EASY).unwrap();
        match solve(&b) {
            SolveOutcome::Unique(s) => assert_eq!(s.to_string_dotted(), EASY_SOLN),
            other => panic!("expected unique, got {:?}", other),
        }
    }

    #[test]
    fn propagating_solver_cascade_forces_singles() {
        // Givens leave each diagonal cell as the only empty in its row -> the
        // propagator must fill all of them by cascade and return the unique grid.
        let mut b = Board::from_str(SOLVED6).unwrap();
        for i in 0..6 {
            b.set(i, i, 0);
        }
        let v = Variant::classic_n(6);
        match solve_variant(&b, &v) {
            SolveOutcome::Unique(s) => assert_eq!(s.to_string_dotted(), SOLVED6),
            other => panic!("expected unique, got {:?}", other),
        }
    }

    #[test]
    fn ctx_peers_classic_9x9_has_20() {
        let v = Variant::classic();
        let ctx = SolveCtx::new(&v, 9);
        // Cell (0,0): 8 row + 8 col + 4 box-only (excluding shared) = 20 peers.
        let p = &ctx.peers[0];
        assert_eq!(p.len(), 20, "classic peer count");
        assert!(!p.contains(&0), "cell is not its own peer");
        assert!(p.contains(&1) && p.contains(&9) && p.contains(&10));
    }

    #[test]
    fn ctx_peers_xsudoku_diagonal_included() {
        let v = Variant::xsudoku_n(9);
        let ctx = SolveCtx::new(&v, 9);
        // (0,0) is on the main diagonal; (4,4) shares it and is in neither
        // its row, col, nor box -> present only because of the diagonal.
        assert!(ctx.peers[0].contains(&(4 * 9 + 4)), "diagonal peer present");
        assert!(!ctx.has_cages);
    }

    /// Blank a few cells out of a complete, valid solution and assert both
    /// solvers agree. Operating on NEAR-FULL boards keeps the naive oracle
    /// tractable for every variant — including Killer, whose real givens are
    /// near-empty and would make naive uniqueness proofs slow (precisely the
    /// blowup propagation fixes).
    ///
    /// `min_clues = cells` disables the generator's carve step, so each puzzle
    /// is just a fresh random solution (fast). Jigsaw is exercised at 6×6 only:
    /// the generator builds solutions with naive first-empty backtracking
    /// (`fill_random`, which does NOT use this solver), and for the irregular
    /// 9×9 jigsaw boxes that has a pathological heavy tail (some seeds take 40+
    /// seconds). The solver's jigsaw code path is size-independent, so 6×6
    /// jigsaw covers it; large-n coverage comes from classic/X at 9×9 and the
    /// separate 16×16 test. (The slow 9×9 jigsaw *generation* is a pre-existing
    /// concern, tracked separately.)
    #[test]
    fn propagating_solver_matches_naive_across_sizes_and_variants() {
        // (n, kind) — every combo whose generation is reliably fast.
        let combos: &[(usize, VariantKind)] = &[
            (6, VariantKind::Classic),
            (9, VariantKind::Classic),
            (6, VariantKind::XSudoku),
            (9, VariantKind::XSudoku),
            (6, VariantKind::Jigsaw),
            (6, VariantKind::Killer),
            (9, VariantKind::Killer),
        ];
        let mut checked = 0u32;
        for &(n, kind) in combos {
            let cells = n * n;
            for seed in 0..25u64 {
                let mut rng = Rng::new(seed * 1000 + n as u64);
                let puzzle = generate_for_n(&mut rng, n, kind, cells);
                let variant = &puzzle.variant;

                // Blank an increasing number of cells (1..=5) from the solution.
                // Few holes -> naive stays fast; varying the count exercises
                // both Unique and Multiple outcomes.
                for holes in 1..=5usize {
                    let mut b = puzzle.solution;
                    let mut idxs: Vec<usize> = (0..cells).collect();
                    rng.shuffle(&mut idxs);
                    for &i in idxs.iter().take(holes) {
                        b.0[i] = 0;
                    }
                    assert_eq!(
                        solve_variant(&b, variant),
                        super::naive::solve_variant_naive(&b, variant),
                        "n={n} kind={kind:?} seed={seed} holes={holes}"
                    );
                    checked += 1;
                }
            }
        }
        assert!(checked >= 800, "expected a broad sweep, ran {checked}");
    }

    /// A deliberately inconsistent board must be Unsolvable under both solvers.
    #[test]
    fn propagating_solver_matches_naive_on_contradictions() {
        let v = Variant::classic();
        let mut b = Board::empty();
        b.set(0, 0, 5);
        b.set(0, 1, 5);
        assert_eq!(solve_variant(&b, &v), super::naive::solve_variant_naive(&b, &v));
        assert_eq!(solve_variant(&b, &v), SolveOutcome::Unsolvable);
    }

    /// n=16 differential coverage. The naive solver is only fast on near-full
    /// 16×16 boards, so this carves just a few holes from a generated (high-clue,
    /// floor=47%) grid — enough to exercise propagation at size 16 without the
    /// ~14 s low-clue blowup the naive oracle would hit.
    #[test]
    fn propagating_solver_matches_naive_16x16_near_full() {
        for seed in 0..3u64 {
            let mut rng = Rng::new(7000 + seed);
            let puzzle = generate_for_n(&mut rng, 16, VariantKind::Classic, 0);
            let variant = &puzzle.variant;

            assert_eq!(
                solve_variant(&puzzle.givens, variant),
                super::naive::solve_variant_naive(&puzzle.givens, variant),
                "16x16 givens seed={seed}"
            );

            // Remove 3 clues — still near-full, so naive stays fast.
            let mut b = puzzle.givens;
            let mut idxs: Vec<usize> = (0..256).filter(|&i| b.0[i] != 0).collect();
            rng.shuffle(&mut idxs);
            for &i in idxs.iter().take(3) {
                b.0[i] = 0;
            }
            assert_eq!(
                solve_variant(&b, variant),
                super::naive::solve_variant_naive(&b, variant),
                "16x16 carved seed={seed}"
            );
        }
    }
}
