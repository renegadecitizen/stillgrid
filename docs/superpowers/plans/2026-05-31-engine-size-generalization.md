# Engine Size-Generalization Implementation Plan (Layer 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Rust engine operate on any board size `n ∈ {6, 9, 16}` with zero behavioral change at `n=9`, so 6×6 and 16×16 puzzles can be solved, generated, and graded across all four variants.

**Architecture:** Representation **B** from the spec — a fixed max-capacity buffer (`[T; MAX_CELLS]`, `MAX_CELLS = 256`) plus a runtime `n` carried on `Board` and `Variant`. `Board` stays `Copy`. The global `N`/`CELLS` constants and the global `cell_index(r,c)` helper are removed; sizes flow from the board/variant. Candidate bitmasks widen from `u16` to `u32` (digit 16 needs bit 16). Box geometry becomes explicit `box_h × box_w` (6×6 is 2×3, not √n).

**Tech Stack:** Rust (stable), `cargo test --release`. Crate: `engine/` (`stillgrid-engine`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-31-board-size-generalization-design.md`

---

## Core API decisions (locked — referenced by all tasks)

These types/signatures are the contract every task below builds against. Defined concretely in Tasks 1–2; later tasks must match these names exactly.

- `board::MAX_N: usize = 16`, `board::MAX_CELLS: usize = 256`.
- **`Board` is a tuple struct: `pub struct Board(pub [u8; MAX_CELLS], pub u8)`** — `.0` is the cells buffer (now length 256; only the first `n*n` are live), `.1` is `n`. **Derives `Copy`.** *Why a tuple struct:* it preserves the existing `board.0[idx]` field access used across `variant.rs`/`generator.rs`, so changing the representation does NOT break those modules — the crate keeps compiling while each module migrates.
- `Board` accessors: `fn n(&self) -> usize { self.1 as usize }`, `fn cells(&self) -> usize { self.n() * self.n() }`.
- `fn box_dims(n: usize) -> (usize, usize)` **lives in `board.rs`** (lowest module — avoids a board→variant dependency cycle, since `Board::can_place` needs it): `6 → (2, 3)`, `9 → (3, 3)`, `16 → (4, 4)`. Panics on unsupported `n`. `variant.rs` calls `crate::board::box_dims`.
- **During migration** the generalized helper is named `variant::cell_index_n(n, r, c) -> usize { r * n + c }`, and the legacy `variant::cell_index(r, c)` (9-based) is **kept unchanged** so un-migrated modules (techniques.rs, generator.rs) compile without edits. **Task 9** deletes the legacy `cell_index`, renames `cell_index_n → cell_index`, and updates the migrated callers. (Final target name is `cell_index(n, r, c)`.)
- `Variant` gains `pub n: u8`, `pub box_h: u8`, `pub box_w: u8`; `boxes: Vec<Vec<usize>>` replaces `[[usize; 9]; 9]`; `box_of: [u8; MAX_CELLS]`.

### Incremental-compilation strategy (so tasks stay independent)

The board-representation change ripples across modules; to keep each task independently compilable with the **full 9×9 suite green throughout**:
- Keep `pub const N: usize = 9;` and `pub const CELLS: usize = 81;` in `board.rs` **alive during migration** (Tasks 1–6). Un-migrated modules keep referencing them and compile unchanged.
- Keep both `cell_index` arities (old 9-based + new `n`-based) during migration.
- The tuple-struct `.0`/`.1` layout keeps `board.0[idx]` working everywhere.
- **Task 9 (cleanup)** removes `N`, `CELLS`, and the old `cell_index` shim once Tasks 1–6 have migrated every caller, and re-runs the full suite.
- Consequence: between tasks, modules not yet widened (e.g. `techniques.rs` masks still `[u16; CELLS=81]`) are correct at `n=9` but would panic/misbehave at `n∈{6,16}`. That is fine — the 6×6/16×16 tests for a module are only added in that module's task. The 9×9 gate never regresses.
- **Symbol map** (single source of truth, `board.rs`):
  - encode: `0 → '.'`; `1..=9 → ('0' + d)`; `10..=16 → ('A' + (d - 10))`.
  - decode: `'.' | '0' → 0`; `'1'..='9' → d`; `'A'..='G' → 10 + (ch - 'A')`.
- Candidate masks: `[u32; MAX_CELLS]`; `ALL` computed per-`n`: `fn all_mask(n: usize) -> u32 { ((1u32 << (n + 1)) - 2) }`. At `n=9` this is `0b11_1111_1110` (identical to today's const); at `n=16` it sets bits `1..=16`.

**Default-9 back-compat:** add `Board::empty_n(n)` and keep `Board::empty()` as `empty_n(9)`. Keep `Variant::classic()` (= `classic_n(9)`), `xsudoku()`, `jigsaw(map)`, `killer(cages)` as 9-defaulting shims so existing 9×9 tests and the classic argv binary path compile unchanged.

---

## Task 1: `Board` carries `n` (board.rs)

**Files:**
- Modify: `engine/src/board.rs`

- [ ] **Step 1: Write the failing test**

Add to the `tests` module in `engine/src/board.rs`:

```rust
#[test]
fn board_sizes_6_9_16() {
    assert_eq!(Board::empty_n(6).cells(), 36);
    assert_eq!(Board::empty_n(9).cells(), 81);
    assert_eq!(Board::empty_n(16).cells(), 256);
    let mut b = Board::empty_n(6);
    b.set(5, 5, 4);
    assert_eq!(b.get(5, 5), 4);
}

#[test]
fn box_dims_per_size() {
    assert_eq!(box_dims(6), (2, 3));
    assert_eq!(box_dims(9), (3, 3));
    assert_eq!(box_dims(16), (4, 4));
}

#[test]
fn symbol_roundtrip_16() {
    // 16-char first row uses 1-9 then A-G; rest empty.
    let mut s = String::from("123456789ABCDEFG");
    s.push_str(&".".repeat(256 - 16));
    let b = Board::from_str(&s).unwrap();
    assert_eq!(b.n(), 16);
    assert_eq!(b.get(0, 9), 10); // 'A'
    assert_eq!(b.get(0, 15), 16); // 'G'
    assert_eq!(b.to_string_dotted(), s);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && cargo test --release board:: 2>&1 | tail -20`
Expected: FAIL — `empty_n` / `cells` not found; `from_str` rejects length 256.

- [ ] **Step 3: Rewrite board.rs storage + symbol map**

Replace the top of `engine/src/board.rs` (the struct + `empty`/`from_str`/`to_string_dotted`/`get`/`set`) with the following. **Keep the existing `pub const N`/`pub const CELLS` lines** (other modules still reference them during migration — Task 9 removes them). Add `MAX_N`/`MAX_CELLS`/`box_dims`/symbol-map alongside.

```rust
//! Generalized sudoku board: any size n in {6, 9, 16}.

pub const N: usize = 9; // legacy 9×9 constant — kept until Task 9 cleanup
pub const CELLS: usize = N * N; // legacy — kept until Task 9 cleanup
pub const MAX_N: usize = 16;
pub const MAX_CELLS: usize = MAX_N * MAX_N;

/// Box geometry per size. 6×6 boxes are 2 tall × 3 wide (not √n).
/// Lives here (not variant.rs) so `Board::can_place` can use it without a cycle.
pub fn box_dims(n: usize) -> (usize, usize) {
    match n {
        6 => (2, 3),
        9 => (3, 3),
        16 => (4, 4),
        _ => panic!("unsupported size {n}"),
    }
}

/// Encode a digit (0 = empty) to its display char: 1-9 -> '1'..'9', 10-16 -> 'A'..'G'.
pub fn digit_to_char(v: u8) -> char {
    match v {
        0 => '.',
        1..=9 => (b'0' + v) as char,
        10..=16 => (b'A' + (v - 10)) as char,
        _ => '?',
    }
}

/// Decode a display char to a digit (0 = empty). Returns None on bad char.
pub fn char_to_digit(c: char) -> Option<u8> {
    match c {
        '.' | '0' => Some(0),
        '1'..='9' => Some(c as u8 - b'0'),
        'A'..='G' => Some(10 + (c as u8 - b'A')),
        _ => None,
    }
}

fn size_from_len(len: usize) -> Option<u8> {
    match len {
        36 => Some(6),
        81 => Some(9),
        256 => Some(16),
        _ => None,
    }
}

/// Tuple struct: `.0` = cells buffer (first n*n live), `.1` = n.
/// Tuple layout preserves existing `board.0[idx]` access across the crate.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Board(pub [u8; MAX_CELLS], pub u8);

impl Board {
    pub fn empty() -> Self {
        Self::empty_n(9)
    }

    pub fn empty_n(n: usize) -> Self {
        assert!(matches!(n, 6 | 9 | 16), "unsupported size {n}");
        Board([0u8; MAX_CELLS], n as u8)
    }

    #[inline]
    pub fn n(&self) -> usize {
        self.1 as usize
    }

    #[inline]
    pub fn cells(&self) -> usize {
        self.n() * self.n()
    }

    /// Parse from a 36/81/256-char string. Size is inferred from length.
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Result<Self, String> {
        let trimmed: String = s.chars().filter(|c| !c.is_whitespace()).collect();
        let n = size_from_len(trimmed.len())
            .ok_or_else(|| format!("expected 36/81/256 chars, got {}", trimmed.len()))?;
        let mut b = Board::empty_n(n as usize);
        for (i, ch) in trimmed.chars().enumerate() {
            let d = char_to_digit(ch).ok_or_else(|| format!("bad char {ch} at {i}"))?;
            if d as usize > n as usize {
                return Err(format!("digit {d} out of range for size {n}"));
            }
            b.0[i] = d;
        }
        Ok(b)
    }

    pub fn to_string_dotted(&self) -> String {
        self.0[..self.cells()].iter().map(|&v| digit_to_char(v)).collect()
    }

    #[inline]
    pub fn get(&self, row: usize, col: usize) -> u8 {
        self.0[row * self.n() + col]
    }

    #[inline]
    pub fn set(&mut self, row: usize, col: usize, v: u8) {
        let n = self.n();
        self.0[row * n + col] = v;
    }
}
```

Note: `box_dims` is referenced by `Board::can_place` in Step 4 as `box_dims(n)` (same module). `variant.rs` will call it as `crate::board::box_dims` in Task 2. **Remove the `box_dims` definition from Task 2** (it now lives here) — Task 2 only adds the generalized `cell_index(n, …)`.

- [ ] **Step 4: Update `can_place`/`is_complete`/`is_consistent` for runtime n**

In the same `impl Board`, replace the bodies that referenced `N`:
- `can_place`: replace `for i in 0..N` → `let n = self.n(); for i in 0..n`; replace the hardcoded `/3*3` box math with the `box_dims`-derived block (note `box_dims` is in this same module — call it unqualified):

```rust
    pub fn can_place(&self, row: usize, col: usize, v: u8) -> bool {
        let n = self.n();
        for i in 0..n {
            if self.get(row, i) == v || self.get(i, col) == v {
                return false;
            }
        }
        let (bh, bw) = box_dims(n);
        let br = (row / bh) * bh;
        let bc = (col / bw) * bw;
        for r in br..br + bh {
            for c in bc..bc + bw {
                if self.get(r, c) == v {
                    return false;
                }
            }
        }
        true
    }
```

- `is_complete`: `self.0[..self.cells()].iter().all(|&v| v != 0)`.
- `is_consistent`: replace `0..N` loops with `0..n` and the `/3*3` block with the `box_dims` block as above (mirror the `can_place` box loop, skipping `(rr,cc) == (r,c)`).

(Note: `Board::can_place`/`is_consistent` are only the classic-3×3 path; variant-aware checks live in `variant.rs`. They must still compile and stay correct at every n.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd engine && cargo test --release board:: 2>&1 | tail -20`
Expected: PASS — both new tests plus the existing `parse_and_render`, `rejects_wrong_length`, `can_place_basic`.

- [ ] **Step 6: Commit**

```bash
git add engine/src/board.rs
git commit -m "engine: Board carries runtime n; 6/9/16 + A-G symbol map"
```

---

## Task 2: generalized `cell_index` + `Variant` fields (variant.rs)

**Files:**
- Modify: `engine/src/variant.rs`

(Note: `box_dims` already lives in `board.rs` as of Task 1 — do NOT redefine it here.)

- [ ] **Step 1: Write the failing test**

Add to the `tests` module in `engine/src/variant.rs`:

```rust
#[test]
fn classic_6x6_boxes_are_2x3() {
    let v = Variant::classic_n(6);
    assert_eq!(v.n, 6);
    // top-left 2x3 region is box 0
    for r in 0..2 {
        for c in 0..3 {
            assert_eq!(v.box_of[cell_index(6, r, c)], 0);
        }
    }
    // every box has exactly 6 cells
    assert_eq!(v.boxes.len(), 6);
    assert!(v.boxes.iter().all(|b| b.len() == 6));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && cargo test --release variant:: 2>&1 | tail -20`
Expected: FAIL — `classic_n` not found; new `cell_index(n, …)` arity not present.

- [ ] **Step 3: Generalize `cell_index` (keep a 9-arity shim), extend struct**

In `engine/src/variant.rs`:
- Delete the `Mini 6×6 and 16×16 ... deferred` doc-comment lines.
- Change the import to `use crate::board::{box_dims, Board, CELLS, MAX_CELLS, N};` (keep `N` for the legacy `cell_index` shim and `CELLS` for the `jigsaw` shim copy; both removed in Task 9).
- **Keep** the existing `pub fn cell_index(r: usize, c: usize) -> usize { r * N + c }` exactly as-is (techniques.rs / generator.rs still call it — leave them untouched this task). **Add** the generalized helper alongside it:

```rust
#[inline]
pub fn cell_index_n(n: usize, r: usize, c: usize) -> usize {
    r * n + c
}
```

Inside `variant.rs` itself, migrate this module's own `cell_index(r, c)` calls to `cell_index_n(self.n(), r, c)`.

**Keep the legacy constructor signatures compiling.** The `Variant` struct's `box_of` widens to `[u8; MAX_CELLS]`, so the existing `jigsaw(box_partition: [u8; CELLS])` callers in `generator.rs` would break. Keep a `jigsaw(box_partition: [u8; CELLS])` shim (9-default) that copies the 81-entry partition into the `MAX_CELLS` field and delegates to the general builder; add the general `jigsaw_n(n, [u8; MAX_CELLS])`. Likewise keep `classic()`, `xsudoku()`, `killer(Vec<Cage>)` as 9-defaulting shims (generator/solver/tests still call them). Generator migrates to the `_n` builders in Task 5.

- Extend the struct (replace the `box_of`/`boxes` fields and add size fields):

```rust
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
```

- [ ] **Step 4: Generalize the constructors**

Replace `classic`, `xsudoku`, `jigsaw`, `killer` with `_n` builders + 9-defaulting shims:

```rust
impl Variant {
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
                let idx = cell_index(n, r, c);
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
    // wider MAX_CELLS buffer and delegate. (CELLS must be in the `use` import.)
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
}
```

- [ ] **Step 5: Generalize `box_idx`, `can_place`, `is_solution_consistent`, peer math**

In `variant.rs`, add `fn n(&self) -> usize { self.n as usize }` to the `impl Variant`, then replace, in this module's own methods (`box_idx`, `can_place`, `is_solution_consistent`, and `solver.rs`'s `is_partial_consistent` lives in solver — leave it):
- every `cell_index(r, c)` call → `cell_index_n(self.n(), r, c)` (the migration-era 3-arg helper);
- every `for i in 0..N` → `for i in 0..self.n()`;
- every diagonal `N - 1` → `self.n() - 1`;
- every `[false; 10]` digit-seen array → `vec![false; self.n() + 1]`;
- in cage partial-sum logic, the magic `9` (max digit) → `self.n() as u32`, i.e. `if remaining > self.n() as u32 * empty { return false; }`;
- box-count loops `for b in 0..9` → `for b in 0..self.n()`.
The `boxes[b]` iteration is unchanged (now `Vec<Vec<usize>>`, still indexable).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd engine && cargo test --release variant:: 2>&1 | tail -20`
Expected: PASS — new size tests plus existing `classic_box_partition_is_standard_3x3`, `xsudoku_diagonals_enforced`, `killer_cage_uniqueness_and_sum`.

- [ ] **Step 7: Commit**

```bash
git add engine/src/variant.rs
git commit -m "engine: Variant carries n/box_h/box_w; Vec boxes; box_dims"
```

---

## Task 3: Solver works at any n (solver.rs)

**Files:**
- Modify: `engine/src/solver.rs`

- [ ] **Step 1: Write the failing test**

Add to the `tests` module in `engine/src/solver.rs`:

```rust
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
```

(`SOLVED6` is a verified-valid 6×6: rows `123456 / 456123 / 231564 / 564231 / 312645 / 645312` — all rows, cols, and 2×3 boxes hold 1..=6 exactly once. Blanking the diagonal leaves exactly one empty per row, guaranteeing a unique completion without needing the generator.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && cargo test --release solver:: 2>&1 | tail -20`
Expected: FAIL — solver still loops `0..N` and tries `1u8..=9u8`, so 6×6 candidate search is wrong.

- [ ] **Step 3: Generalize solver loops**

In `engine/src/solver.rs`:
- Change import to `use crate::board::Board;` (drop `N`).
- In `find_empty_min_options`: derive `let n = board.n();`, loop `for r in 0..n { for c in 0..n { ... } }`, and build options with `(1u8..=n as u8).filter(...)`.
- In `is_partial_consistent`: loop `0..board.n()` for both r and c.
- `search` and `solve_variant` need no numeric change (they delegate to `find_empty_min_options` and `can_place`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd engine && cargo test --release solver:: 2>&1 | tail -20`
Expected: PASS — `solves_6x6_uniquely`, `empty_6x6_has_multiple`, plus existing `solves_easy`, `detects_multiple_solutions`, `detects_unsolvable`.

- [ ] **Step 5: Commit**

```bash
git add engine/src/solver.rs
git commit -m "engine: solver loops over runtime n; solves 6x6"
```

---

## Task 4: Techniques — widen masks to u32, per-n `ALL`, generalize peer/candidate grid (techniques.rs)

**Files:**
- Modify: `engine/src/techniques.rs`

This is the large mechanical task. It is gated by the **full existing 9×9 grader test suite** (which must stay green — proving no 9×9 regression) plus a new 6×6 grading test.

- [ ] **Step 1: Write the failing test**

Add to the `tests` module in `engine/src/techniques.rs`:

```rust
#[test]
fn all_mask_matches_9_and_16() {
    // 9×9 must be bit-identical to the old hardcoded const; 16×16 needs bit 16.
    assert_eq!(all_mask(9), 0b11_1111_1110);
    assert_eq!(all_mask(16), (1u32 << 17) - 2); // bits 1..=16 set, bit 0 clear
}

#[test]
fn grades_6x6_solved() {
    // Diagonal-blanked known-valid 6×6 solution — solvable by singles alone,
    // so the grader must reach Solved. Generator-free (Task 5 not required).
    const SOLVED6: &str = "123456456123231564564231312645645312";
    let v = Variant::classic_n(6);
    let mut b = Board::from_str(SOLVED6).unwrap();
    for i in 0..6 {
        b.set(i, i, 0);
    }
    match grade_variant(&b, &v) {
        GradeOutcome::Solved { solution, .. } => assert!(v.is_solution_consistent(&solution)),
        GradeOutcome::Stuck { .. } => panic!("6x6 should be human-solvable"),
    }
}
```

(`all_mask` is a private fn in this module; the in-module `tests` block can call it via `use super::*`. These tests need no generator. Before Step 3 the `all_mask` test won't even compile — that counts as the failing-test state.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && cargo test --release techniques:: 2>&1 | tail -30`
Expected: FAIL — `ALL`/`masks` are `u16` and hardcoded `0..N`/`1..=9` paths give wrong candidates at n=6.

- [ ] **Step 3: Widen masks and parameterize `ALL`**

In `engine/src/techniques.rs`:
- Change imports to `use crate::board::{Board, MAX_CELLS, MAX_N};` and `use crate::variant::{cell_index_n, Variant};` (this module migrates fully to the 3-arg `cell_index_n` — the legacy 2-arg `cell_index` is 9-only and must not be used at runtime n).
- `Candidates.masks: [u32; MAX_CELLS]`.
- Delete `const ALL: u16 = ...`. Add `fn all_mask(n: usize) -> u32 { (1u32 << (n + 1)) - 2 }`.
- `Candidates::from_board(b, peers)` initializes `masks: [0u32; MAX_CELLS]`, then sets the live cells to `all_mask(b.n())` before filling:

```rust
    fn from_board(b: &Board, peers: &PeerTable) -> Self {
        let n = b.n();
        let mut c = Candidates { masks: [0u32; MAX_CELLS] };
        for i in 0..(n * n) {
            c.masks[i] = all_mask(n);
        }
        for r in 0..n {
            for col in 0..n {
                let v = b.get(r, col);
                if v != 0 {
                    c.fill(r, col, v, peers);
                }
            }
        }
        c
    }
```

- `get`/`set`/`fill` use `r * n + c` — thread `n` in (store `n: usize` on `Candidates`, set in `from_board`, or pass the board). Simplest: add a `n: usize` field to `Candidates`; `get(&self, r, c) -> self.masks[r * self.n + c]`. Update `fill` to use `self.n` and `1u32 << v`.
- `node_of`: currently `[[u16; N]; CELLS]`. **First read how it is indexed** in the actual code — by the raw digit (`node_of[cell][digit]`, needs size ≥ digit+1) or by digit−1 (`node_of[cell][digit-1]`, needs size ≥ digit). Generalize the **cell** dimension `CELLS → MAX_CELLS`, and the **digit** dimension to cover digits up to 16 while preserving the existing indexing convention: `MAX_N + 1` if indexed by raw digit, `MAX_N` if indexed by digit−1. Node **ids** can stay `u16` (256 cells × ≤16 digits = ≤4096 ≤ `u16::MAX`); keep `NONE_NODE: u16 = u16::MAX`. The element type of `node_of` was `u16` (a node id) — it can stay `u16`. (Only the candidate *masks* must become `u32`, because they pack digit bits up to bit 16.)

- [ ] **Step 4: Sweep the size-coupled constants in the technique bodies**

Across `techniques.rs`, replace mechanically (each gated by the test suite, not individually):
- `for r in 0..N` / `0..N` row/col loops → `0..n` where `let n = board.n()` (or `variant.n()`) is in scope at the top of each technique fn.
- digit loops `1..=9` / `1u8..=9` → `1..=n`.
- `cell_index(r, c)` → `cell_index_n(n, r, c)` (import is `cell_index_n`).
- box-count loops `0..9` → `0..n`; box-cell loops already iterate `variant.boxes[b]` (now `Vec`), unchanged.
- `PeerTable::build`: `peers: vec![Vec::new(); n*n]`; `seen` arrays `vec![false; n*n]` (was `[false; CELLS]`); `r = i / n; c = i % n`; loops `0..n`; diagonals use `n - 1`.
- Any `[T; CELLS]` working buffer used at full size → `[T; MAX_CELLS]` (iterate only `0..n*n`).
- Any digit-indexed `[T; 10]` array → `[T; MAX_N + 1]`.
- Bit operations on masks: `1u16` → `1u32`; mask popcount/iteration over digits loop `1..=n`.

Tip for the executor: `rg '\bN\b|\bCELLS\b|1u16|: u16|\[false; 10\]|0\.\.9\b|1\.\.=9' engine/src/techniques.rs` enumerates the remaining sites.

- [ ] **Step 5: Run the FULL engine test suite (9×9 regression gate)**

Run: `cd engine && cargo test --release 2>&1 | tail -30`
Expected: PASS — **all** pre-existing 9×9 grader tests (incl. variant + T5 tests) green, plus the new 6×6 grading test. This is the hard gate: any 9×9 behavioral drift fails here.

- [ ] **Step 6: Commit**

```bash
git add engine/src/techniques.rs
git commit -m "engine: techniques u32 masks + per-n ALL; grader works at any n"
```

---

## Task 5: Generator at any n (generator.rs)

**Files:**
- Modify: `engine/src/generator.rs`

- [ ] **Step 1: Write the failing test**

Add to the `tests` module in `engine/src/generator.rs`:

```rust
#[test]
fn generate_variant_6_and_16_unique() {
    use crate::solver::{solve_variant, SolveOutcome};
    let mut rng = Rng::new(7);
    for &n in &[6usize, 16usize] {
        let v = Variant::classic_n(n);
        let p = generate_variant(&mut rng, &v, 0);
        let b = Board::from_str(&p.givens).unwrap();
        assert_eq!(b.n(), n);
        assert!(matches!(solve_variant(&b, &v), SolveOutcome::Unique(_)), "n={n} not unique");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && cargo test --release generator:: 2>&1 | tail -20`
Expected: FAIL — generator allocates `(0..CELLS)` and fills `0..N`, producing 9×9 regardless of `variant.n`.

- [ ] **Step 3: Generalize the generator**

In `engine/src/generator.rs`:
- Change import to `use crate::board::Board;` (drop `N`, `CELLS`).
- In every fn, derive `let n = variant.n as usize; let cells = n * n;` (use the **public `n` field** — `Variant::n()` is private to variant.rs) and replace `CELLS` → `cells`, `0..N` → `0..n`.
- `random_solution`: start from `Board::empty_n(n)`; fill loops `0..n`.
- `generate_variant`: `order: (0..cells).collect()`; `clue_count = cells`; dig/uniqueness loop unchanged in structure.
- `try_jigsaw_partition` / `neighbours`: `partition = [u8::MAX; MAX_CELLS]` but seed/region growth over `0..cells`, region count `n`, neighbour math uses `n` (`cell / n`, `cell % n`, edges `cell - n` / `cell + n`, `r < n - 1`, `c < n - 1`). Return `[u8; MAX_CELLS]`.
- `generate_killer` → add `generate_killer_n(rng, n)`; cage growth bounded by `n` cells per cage max; keep `generate_killer()` = `_n(9)`. Cage sum is literal digit sum (unchanged).
- `generate_for(rng, kind, min_clues)` → add `generate_for_n(rng, n, kind, min_clues)` dispatching to the `_n` builders; keep `generate_for` = `_n(9)`.
- Update `lib.rs` re-exports if new public `_n` fns are added: `pub use generator::{..., generate_variant, generate_for_n, generate_killer_n, ...};`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd engine && cargo test --release generator:: 2>&1 | tail -20`
Expected: PASS — `generate_variant_6_and_16_unique` plus existing generator tests.

- [ ] **Step 5: Commit**

```bash
git add engine/src/generator.rs engine/src/lib.rs
git commit -m "engine: generator produces unique puzzles at any n"
```

---

## Task 6: Binaries carry `size` (bin/*.rs)

**Files:**
- Modify: `engine/src/bin/stillgrid-grade.rs`
- Modify: `engine/src/bin/stillgrid-generate.rs`
- Modify: `engine/src/bin/stillgrid-solve.rs`

- [ ] **Step 1: Write the failing test (CLI integration via shell)**

Create `engine/tests/cli_sizes.rs`:

```rust
use std::process::Command;

fn bin(name: &str) -> String {
    format!("{}/../target/release/{}", env!("CARGO_MANIFEST_DIR"), name)
}

#[test]
fn generate_grade_6x6_via_cli() {
    // generate a 6x6 classic, then grade it back — both via JSON stdin/argv.
    let out = Command::new(bin("stillgrid-generate"))
        .args(["--variant", "classic", "--size", "6"])
        .output()
        .expect("run generate");
    assert!(out.status.success(), "generate failed: {}", String::from_utf8_lossy(&out.stderr));
    let givens = String::from_utf8(out.stdout).unwrap();
    assert_eq!(givens.trim().chars().filter(|c| !c.is_whitespace()).count(), 36);
}
```

(Adjust arg names to match the existing CLI flag style — inspect each bin's `main` first; the assertion that matters is a 36-char 6×6 board round-trips through the binaries.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engine && cargo build --release && cargo test --release --test cli_sizes 2>&1 | tail -20`
Expected: FAIL — binaries don't accept `--size`; emit 81 chars.

- [ ] **Step 3: Thread `size` through the binaries**

For each binary `main`:
- Add a `--size <6|9|16>` flag (default `9`) and/or infer `n` from input length where input is a board string. Variant JSON input on stdin (grade) gains an optional `"size"` field (default 9); pass `n` into the `_n` variant/generator builders.
- `stillgrid-solve`: infer `n` from the input board length (already length-based via `Board::from_str`).
- `stillgrid-generate`: pass `--size` into `generate_for_n` / `generate_killer_n`.
- `stillgrid-grade`: read `size` from the JSON payload (or infer from `givens` length); build the variant with `_n`.
- Default-9 paths must keep producing byte-identical output to today for existing 9×9 callers.

- [ ] **Step 4: Run tests + manual smoke**

Run: `cd engine && cargo build --release && cargo test --release --test cli_sizes 2>&1 | tail -20`
Expected: PASS.

Manual smoke (record output in the commit message):
```bash
engine/target/release/stillgrid-generate --variant classic --size 16 | tr -d '\n' | wc -c   # 256
echo '{"givens":"<36-char 6x6>","variant":"classic","size":6}' | engine/target/release/stillgrid-grade | jq .tier
```

- [ ] **Step 5: Commit**

```bash
git add engine/src/bin/ engine/tests/cli_sizes.rs
git commit -m "engine(cli): --size flag + JSON size field; default 9"
```

---

## Task 7: Cross-size integration tests (all variants × {6, 9})

**SCOPE CHANGE (2026-05-31):** 16×16 is **deferred** (see Task 8 / spec Risk #1 — the no-propagation solver can't generate/grade 16×16 per-request). This matrix covers **{6, 9} only**, across all 4 variants. The engine remains 16×16-capable; it's simply not exercised here.

**Files:**
- Create: `engine/tests/size_matrix.rs`

- [ ] **Step 1: Write the integration test**

`Puzzle` already carries its own `variant` (and `givens` is a `Board`, not a string), so use `p.variant` directly — this covers jigsaw/killer structure with no reconstruction.

```rust
use stillgrid_engine::{
    generate_for_n, grade_variant, solve_variant, GradeOutcome, SolveOutcome, VariantKind, Rng,
};

#[test]
fn all_variants_solve_grade_6_and_9() {
    let mut rng = Rng::new(99);
    for &n in &[6usize, 9] {
        for kind in [
            VariantKind::Classic,
            VariantKind::XSudoku,
            VariantKind::Jigsaw,
            VariantKind::Killer,
        ] {
            let p = generate_for_n(&mut rng, n, kind, 0);
            let b = p.givens; // Board is Copy
            let v = p.variant.clone();
            assert_eq!(b.n(), n, "n={n} kind={kind:?} wrong size");
            assert!(
                matches!(solve_variant(&b, &v), SolveOutcome::Unique(_)),
                "n={n} kind={kind:?} not unique"
            );
            assert!(
                matches!(grade_variant(&b, &v), GradeOutcome::Solved { .. }),
                "n={n} kind={kind:?} not solved by grader"
            );
        }
    }
}
```

(Confirm `Puzzle`'s fields by reading `generator::Puzzle` first — adapt field names if they differ from `givens`/`variant`. If `p.variant` isn't public, expose it or use the `_n` builder for classic/x and reconstruct jigsaw/killer from whatever the `Puzzle` does expose.)

- [ ] **Step 2: Run + verify**

Run: `cd engine && cargo test --release --test size_matrix 2>&1 | tail -30`
Expected: PASS for all 4 variants at n=6 and n=9.

- [ ] **Step 3: Commit**

```bash
git add engine/tests/size_matrix.rs
git commit -m "engine: cross-size matrix integration tests (all variants × 6/9)"
```

---

## Task 8: 16×16 perf spike — RESOLVED (deferred, no code)

**Outcome (2026-05-31):** The spike's question was answered during Task 5 without needing a separate test. With the current backtracking solver (no constraint propagation):
- A single 16×16 uniqueness check hits **14–15 s** once givens fall below ~45% of cells; minimal-clue carving never completes.
- The grader-based Killer/Jigsaw carve ran **>2 min** without finishing at 16×16.
- **Conclusion: per-request 16×16 generate+grade is not viable** with today's solver.

**Decision (user, 2026-05-31): defer 16×16.** Keep the engine 16×16-*capable* (Task 5's `n>9` clue-floor is a placeholder that keeps `generate_*` from hanging), but **do not surface 16×16** in server/web. A new prerequisite work item — **"solver constraint propagation"** (make `solver.rs` propagate naked singles / candidate elimination instead of pure backtracking) — must land before 16×16 ships. Recorded in spec Risk #1.

No `perf_16.rs` test is added (it would just assert the known-slow behavior). This task is closed as documentation only.

---

## Task 9: Remove migration shims (cleanup)

**Files:**
- Modify: `engine/src/board.rs`, `engine/src/variant.rs`, and any caller of the shims.

By now every module uses runtime `n`. Remove the temporary scaffolding:

- [ ] **Step 1: Delete legacy constants & helpers**
  - `board.rs`: delete `pub const N` and `pub const CELLS`.
  - `variant.rs`: delete legacy `cell_index(r, c)`; rename `cell_index_n` → `cell_index` (now the only one).
  - Delete the 9-defaulting constructor shims **only if** nothing still calls them. Keep `Board::empty()`, `Variant::classic()` etc. if the binaries' classic argv path or existing tests still rely on them — back-compat shims are allowed to stay; pure migration scaffolding is not.

- [ ] **Step 2: Fix fallout & rename callers**

Run `cargo build --release` and fix every `cell_index(r, c)` → `cell_index(n, r, c)` (the `n` is in scope in each migrated fn). `rg 'cell_index9|cell_index_n|\bboard::N\b|\bboard::CELLS\b' engine/src` must return nothing after this step.

- [ ] **Step 3: Full suite green**

Run: `cd engine && cargo test --release 2>&1 | grep "test result:"`
Expected: the full suite (9×9 + all 6×6/16×16 + matrix + perf) passes; counts ≥ the post-Task-8 totals.

- [ ] **Step 4: Commit**

```bash
git add engine/src
git commit -m "engine: remove size-migration shims (N/CELLS/cell_index_n)"
```

---

## Self-Review

**Spec coverage:**
- Representation B (fixed buffer + runtime n, Copy preserved) → Tasks 1–2. ✓
- `u16 → u32` masks + per-n `ALL` → Task 4. ✓
- Non-square boxes (`box_h × box_w`, 6×6 = 2×3) → Task 2 `box_dims`. ✓
- `A–G` symbol map + length-based n inference → Task 1. ✓
- Zero 9×9 behavioral change → Task 4 Step 5 hard gate (full existing suite) + 9-defaulting shims throughout. ✓
- Solve/generate/grade at 6 & 16 across all variants → Tasks 3, 5, 7. ✓
- Binaries carry/infer `size`, default 9 → Task 6. ✓
- 16×16 perf as managed risk + early spike → Task 8 (spec phasing #0). ✓
- Cage soundness invariants preserved → Task 2 Step 5 (no change to cage link rules; only loop bounds/`n`-as-max-digit). ✓

**Out of this plan (Layers 2–3, separate plans):** server `/api` `size` plumbing, daily-stays-9×9, web size selector / board rendering / digit pad / 16×16 responsive treatment / `storage.ts` version bump / `analytics.ts` size prop. These are written after this engine plan lands and its real signatures are known (per the chosen plan structure).

**Placeholder scan:** No `TBD`/`TODO`/"handle edge cases". Two tasks (4, 7) note that a test depends on a later task's signature and give the concrete fallback (hand-authored givens / reconstruct from `Puzzle`) — these are real instructions, not placeholders.

**Type consistency:** `cell_index(n, r, c)`, `Board::empty_n`, `Board::n()/cells()`, `Variant::classic_n/xsudoku_n/jigsaw_n/killer_n`, `box_dims`, `all_mask`, `generate_for_n/generate_killer_n`, `MAX_CELLS`/`MAX_N` used consistently across all tasks.
