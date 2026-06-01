# Solver Constraint Propagation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the solver's pure backtracking with incremental candidate-mask propagation (naked-single cascade), making 16×16 uniqueness checks fast while staying byte-for-byte equivalent to the current solver.

**Architecture:** A per-solve `SolveCtx` precomputes each cell's peer list (row/col/box/diag). The recursive search carries a `[u32; MAX_CELLS]` candidate-mask array: assigning a digit clears it from peers' masks, cascades any peer that collapses to one candidate, and prunes on empty masks. Branch candidates are the MRV cell's mask bits (intersected with `can_place` for cage variants). Undo is whole-array snapshot per node. A differential test proves the new solver returns identical `SolveOutcome` to the retained naive solver across n=6/9/16 and all variants.

**Tech Stack:** Rust (`stillgrid-engine` crate). Test runner: `cargo test --release`. CI gates: `cargo fmt`, `cargo clippy`, `cargo test --release`.

**Reference design:** `docs/superpowers/specs/2026-06-01-solver-constraint-propagation-design.md`

**Key existing APIs (verified):**
- `board.rs`: `MAX_CELLS = 256`, `MAX_N = 16`; `Board(pub [u8; MAX_CELLS], pub u8)`; `board.n()`, `board.cells()`, `board.get(r,c)`, `board.set(r,c,v)`; field `board.0` is the flat `[u8; 256]`.
- `variant.rs`: `Variant { kind, box_of, boxes: Vec<Vec<usize>>, diagonals: bool, cages: Vec<Cage> }`; `variant.n()`, `variant.box_idx(r,c) -> usize`, `variant.can_place(&board,r,c,v) -> bool` (enforces row/col/box/diag + cage uniqueness + cage partial-sum), `variant.is_solution_consistent(&board) -> bool`, `variant.classic()`, `variant.classic_n(n)`, `variant.xsudoku_n(n)`.
- `solver.rs` today: `solve_variant(&Board,&Variant) -> SolveOutcome`; helpers `search`, `find_empty_min_options`, `is_partial_consistent`, `can_place_ignoring_self`.
- `generator.rs`: `generate_for_n(rng,n,kind,min_clues)`, `generate_variant(rng,&variant,min_clues)`, `generate_killer(...)`; n>9 clue floor at the `let floor = if n > 9 { ... }` line.
- `rng.rs`: `Rng::new(seed: u64)`, `rng.gen_range(n)`, `rng.shuffle(&mut slice)`.

---

## File Structure

- **Modify `engine/src/solver.rs`** — the entire change lives here. Add `SolveCtx`, peer precomputation, mask seed, `assign_and_propagate`, `find_branch_cell`, the new propagating `search`; rewire `solve_variant`. Retain the old algorithm as `solve_variant_naive` under `#[cfg(test)]`. Add differential + benchmark tests.
- **Modify `engine/src/generator.rs`** — DECISION-GATED, may be a no-op. Only adjust the n>9 clue floor if Task 5's benchmark shows it is safe; otherwise leave untouched and record the numbers.

No other files change. No server/web changes.

---

## Task 1: Retain the current solver as `solve_variant_naive` (cfg(test))

**Files:**
- Modify: `engine/src/solver.rs`

This preserves the exact current algorithm as the differential-test oracle before we touch `solve_variant`.

- [ ] **Step 1: Copy the current implementation into a test-only naive twin**

In `engine/src/solver.rs`, immediately above the existing `#[cfg(test)] mod tests {` block, add a test-only module that re-exposes today's algorithm. Copy the CURRENT bodies of `solve_variant`, `search`, and `find_empty_min_options` verbatim, renamed:

```rust
#[cfg(test)]
pub(crate) mod naive {
    //! Frozen copy of the pre-propagation solver. Kept permanently as the
    //! differential oracle proving the propagating solver is equivalent.
    use crate::board::Board;
    use crate::variant::Variant;
    use super::SolveOutcome;

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

    fn find_empty_min_options(
        board: &Board,
        variant: &Variant,
    ) -> Option<(usize, usize, Vec<u8>)> {
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
```

Note: `is_partial_consistent` stays a non-test method on `Variant` (Task 3 keeps it), so `naive` calls it via `variant.is_partial_consistent(board)`.

- [ ] **Step 2: Build to verify it compiles**

Run: `cd engine && cargo test --release --no-run 2>&1 | tail -5`
Expected: compiles (warnings about unused `naive` are acceptable at this step; it is used in Task 4).

- [ ] **Step 3: Commit**

```bash
git add engine/src/solver.rs
git commit -m "engine: freeze pre-propagation solver as test-only naive oracle"
```

---

## Task 2: Add `SolveCtx` with precomputed peers

**Files:**
- Modify: `engine/src/solver.rs`

`SolveCtx` holds the variant, `n`, a `has_cages` flag, and `peers[cell]` = the deduped list of cells sharing a row, column, box, or (if `diagonals`) diagonal with `cell`. Computed once per solve.

- [ ] **Step 1: Write the failing test**

Add to the `#[cfg(test)] mod tests` block in `solver.rs`:

```rust
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
    assert!(ctx.has_cages == false);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd engine && cargo test --release --lib ctx_peers 2>&1 | tail -15`
Expected: FAIL — `cannot find type SolveCtx` / `SolveCtx::new`.

- [ ] **Step 3: Implement `SolveCtx`**

Add near the top of `solver.rs` (after the `use` lines, before `solve`):

```rust
use crate::board::MAX_CELLS;

/// Per-solve immutable context: variant + precomputed peer lists.
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
        for i in 0..cells {
            let r = i / n;
            let c = i % n;
            let set = &mut peers[i];
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd engine && cargo test --release --lib ctx_peers 2>&1 | tail -15`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add engine/src/solver.rs
git commit -m "engine: add SolveCtx with precomputed peer lists"
```

---

## Task 3: Implement the propagating solver and rewire `solve_variant`

**Files:**
- Modify: `engine/src/solver.rs`

Add the mask seed, `assign_and_propagate` (cascade), `find_branch_cell` (MRV), and the new recursive `search`; replace `solve_variant`'s body. Delete the old non-test `search` and `find_empty_min_options` (their behavior now lives in `naive`). Keep `is_partial_consistent` and `can_place_ignoring_self` on `Variant`.

- [ ] **Step 1: Write the failing test**

Add to `#[cfg(test)] mod tests`:

```rust
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd engine && cargo test --release --lib propagating_solver 2>&1 | tail -20`
Expected: FAIL — these will currently run against the OLD `solve_variant`; the test is the harness for the rewrite. (If they happen to pass against the old code, that's fine — Step 3 replaces the implementation and they must still pass.)

- [ ] **Step 3: Replace the solver internals**

In `solver.rs`, replace the existing `solve_variant`, `search`, and `find_empty_min_options` (the NON-test ones) with the following. Keep `solve` unchanged. Keep the `impl Variant { is_partial_consistent, can_place_ignoring_self }` block exactly as-is.

```rust
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
    for i in 0..cells {
        if board.0[i] != 0 {
            cand[i] = 0;
            continue;
        }
        let mut m = full;
        for &p in &ctx.peers[i] {
            let pv = board.0[p];
            if pv != 0 {
                m &= !(1u32 << (pv - 1));
            }
        }
        cand[i] = m;
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
    for i in 0..cells {
        if board.0[i] != 0 {
            continue;
        }
        let m = cand[i];
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
```

- [ ] **Step 4: Run the new unit tests + the existing solver tests**

Run: `cd engine && cargo test --release --lib solver:: 2>&1 | tail -25`
Expected: PASS — including the pre-existing `solves_easy`, `detects_multiple_solutions`, `detects_unsolvable`, `solves_6x6_uniquely`, `empty_6x6_has_multiple`, plus the two new `propagating_solver_*` tests.

- [ ] **Step 5: Commit**

```bash
git add engine/src/solver.rs
git commit -m "engine: propagating solver — candidate masks + naked-single cascade"
```

---

## Task 4: Differential equivalence test (new ≡ naive)

**Files:**
- Modify: `engine/src/solver.rs`

Prove the propagating solver returns an identical `SolveOutcome` to the frozen naive solver across many seeded-random puzzles at n=6/9/16 and all variants. This is the correctness gate.

- [ ] **Step 1: Write the differential test**

Add to `#[cfg(test)] mod tests` (uses `super::naive::solve_variant_naive` and the crate's `Rng` + `generator`):

```rust
use crate::generator::generate_for_n;
use crate::rng::Rng;
use crate::variant::VariantKind;

/// Blank a few cells out of a complete, valid solution and assert both solvers
/// agree. Operating on NEAR-FULL boards keeps the naive oracle tractable for
/// every variant — including Killer, whose real givens are near-empty and would
/// make naive uniqueness proofs slow (precisely the blowup propagation fixes).
/// Generation hands us `puzzle.solution`, a full valid grid, to dig from.
#[test]
fn propagating_solver_matches_naive_across_sizes_and_variants() {
    let kinds = [
        VariantKind::Classic,
        VariantKind::XSudoku,
        VariantKind::Jigsaw,
        VariantKind::Killer,
    ];
    let mut checked = 0u32;
    for &n in &[6usize, 9usize] {
        for &kind in &kinds {
            for seed in 0..25u64 {
                let mut rng = Rng::new(seed * 1000 + n as u64);
                let puzzle = generate_for_n(&mut rng, n, kind, 0);
                let variant = &puzzle.variant;
                let cells = n * n;

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
    }
    assert!(checked >= 1000, "expected a broad sweep, ran {checked}");
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
```

Note: `generate_for_n(.., 0)` requests min_clues=0; for n=9 the natural carve stops well above 0 and for n=6 likewise, so generation is fast. The 16×16 case is exercised separately in Task 5 (it is slow under the naive solver, so it does not belong in the always-run differential sweep).

- [ ] **Step 2: Run the differential test**

Run: `cd engine && cargo test --release --lib propagating_solver_matches_naive 2>&1 | tail -20`
Expected: PASS (3 tests: the n=6/9 sweep, the contradiction case, and the n=16 near-full case). If any assertion fires, the propagator diverges from the oracle — STOP and debug (do not weaken the test).

- [ ] **Step 3: Run the full engine suite**

Run: `cd engine && cargo test --release 2>&1 | tail -20`
Expected: all tests PASS (lib + integration: `cli_sizes`, `size_matrix`, etc.).

- [ ] **Step 4: Commit**

```bash
git add engine/src/solver.rs
git commit -m "engine: differential test — propagating solver matches naive oracle"
```

---

## Task 5: 16×16 benchmark + decision-gated generator floor

**Files:**
- Modify: `engine/src/solver.rs` (ignored benchmark test)
- Modify: `engine/src/generator.rs` (only if the benchmark warrants it)

Measure real 16×16 cost and decide whether the n>9 clue floor can be lowered.

- [ ] **Step 1: Add an ignored timing test**

Add to `#[cfg(test)] mod tests` in `solver.rs`:

```rust
// Run with: cargo test --release --lib bench_16x16 -- --ignored --nocapture
#[test]
#[ignore]
fn bench_16x16_uniqueness_and_generation() {
    use crate::generator::generate_for_n;
    use crate::rng::Rng;
    use crate::variant::VariantKind;
    use std::time::Instant;

    // (a) End-to-end generation at a low clue floor (override via min_clues).
    let mut rng = Rng::new(42);
    let t0 = Instant::now();
    let puzzle = generate_for_n(&mut rng, 16, VariantKind::Classic, 0);
    let gen_ms = t0.elapsed().as_millis();
    let clues = puzzle.givens.0.iter().filter(|&&x| x != 0).count();
    println!("16x16 generate: {gen_ms} ms, {clues} clues");

    // (b) A single uniqueness check on the generated puzzle.
    let t1 = Instant::now();
    let out = solve_variant(&puzzle.givens, &puzzle.variant);
    let solve_ms = t1.elapsed().as_millis();
    println!("16x16 uniqueness check: {solve_ms} ms, outcome={out:?}");

    assert!(matches!(out, SolveOutcome::Unique(_)));
}
```

- [ ] **Step 2: Run the benchmark and record numbers**

Run: `cd engine && cargo test --release --lib bench_16x16 -- --ignored --nocapture 2>&1 | tail -20`
Expected: PASS, and prints two timing lines. Record both numbers (generation ms / clue count, and single-check ms) — these drive the decision below.

- [ ] **Step 3: Decision gate — adjust the n>9 floor only if justified**

Open `engine/src/generator.rs` and find the floor line:

```rust
let floor = if n > 9 { min_clues.max(cells * 47 / 100) } else { min_clues };
```

- IF Step 2's single uniqueness check is fast (rule of thumb: **< 50 ms**), lower the n>9 multiplier so 16×16 carves to a real puzzle. Change `47` to a lower value (e.g. `30`) and re-run `bench_16x16` to confirm generation stays acceptable (rule of thumb target: **generation < 2 s**). Keep lowering only while both bounds hold.
- IF the check is slow (≥ 50 ms) or generation blows past ~2 s, **leave the floor unchanged** and record that per-request 16×16 still needs the Postgres pool (#5). This task then makes no `generator.rs` edit.

Either way, write the measured numbers into the plan's outcome notes (Step 5) so the ship decision is evidence-based.

- [ ] **Step 4: If the floor changed, re-verify uniqueness of generated 16×16**

Run: `cd engine && cargo test --release --lib generate_variant_6_and_16 2>&1 | tail -10`
Expected: PASS — `generate_variant_6_and_16_unique` still produces a unique 16×16 at the new floor. (If the floor was left unchanged, this still passes unchanged.)

- [ ] **Step 5: Commit**

```bash
git add engine/src/solver.rs engine/src/generator.rs
git commit -m "engine: 16x16 solver benchmark; floor decision per measured perf"
```

Record in the commit body (or this plan) the measured generation ms / clue count and uniqueness-check ms, plus the per-request-vs-pool recommendation.

---

## Task 6: CI gates + final verification

**Files:** none (verification only)

- [ ] **Step 1: Format**

Run: `cd engine && cargo fmt`
Then: `cd engine && cargo fmt --check 2>&1 | tail -5`
Expected: no diff (clean).

- [ ] **Step 2: Clippy**

Run: `cd engine && cargo clippy --release --all-targets 2>&1 | tail -20`
Expected: no warnings. If clippy flags the `[u32; MAX_CELLS]` copies or peer loops, address per its suggestion without changing behavior (e.g. allow an intentional lint with a comment, matching the existing `large_enum_variant` precedent in this file).

- [ ] **Step 3: Full test suite**

Run: `cd engine && cargo test --release 2>&1 | tail -20`
Expected: all PASS.

- [ ] **Step 4: Commit any fmt/clippy fixups**

```bash
git add -A engine/
git commit -m "engine: fmt + clippy clean for solver propagation"
```

---

## Outcome notes (fill in during Task 5)

- 16×16 generation: __ ms, __ clues (floor multiplier = __).
- 16×16 single uniqueness check: __ ms.
- Recommendation: per-request 16×16 [feasible | needs Postgres pool] because __.

## Success criteria (from spec)

1. Differential test green: new solver ≡ naive across n=6/9 (all variants) + n=16 near-full (Task 4).
2. All existing engine tests green, unchanged (Task 4 Step 3, Task 6 Step 3).
3. CI gates pass: `cargo fmt`, `cargo clippy`, `cargo test --release` (Task 6).
4. Measured 16×16 numbers recorded with a ship recommendation (Task 5).
