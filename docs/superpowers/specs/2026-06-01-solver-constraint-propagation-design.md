# Solver Constraint Propagation — Design

**Date:** 2026-06-01
**Status:** Approved (design)
**Roadmap link:** Phase 2 item #3 (Multi-size) — prerequisite for shipping 16×16.

## Problem

`engine/src/solver.rs` is a pure backtracking solver with an MRV heuristic but **no
constraint propagation**. Every search node re-scans all empty cells, calling
`variant.can_place` for each candidate digit (≈O(n⁴) work per node), and an
assignment triggers no candidate elimination or naked-single cascade. This is fine
at 9×9 but blows up exponentially at 16×16: a single low-clue uniqueness check costs
~14 s (documented), so real (low-clue) 16×16 generation and grading are not viable
per request.

Today's "16×16-capable" claim is a fig leaf: `generate_variant` carries a **47%-clue
floor for n>9** (`generator.rs:89`), so it only ever ships near-full 16×16 boards.
The existing 16×16 generation test passes in ~0.02 s precisely because it barely
carves.

**Constraint propagation in the solver is the root unlock** for 16×16. It also speeds
up every size/variant as a side effect.

## Scope

**This round (engine only):** add constraint propagation to the solver, prove it is
byte-for-byte equivalent to the current solver, and benchmark real 16×16 generation /
grading. Then decide — with measured numbers — whether 16×16 ships per-request or
needs the Postgres puzzle pool (#5).

**Explicitly out of scope this round:**

- Server `size=16` acceptance and the web 16×16 selector (deferred until perf is proven).
- Grader (`techniques.rs`) propagation — the grader already maintains candidate masks;
  separate concern.
- Trail-based undo (snapshot undo ships first; trail is an optimization only if
  benchmarks demand it).
- Blindly removing the n>9 clue floor — it is revisited based on the benchmark, not
  removed unconditionally.

## Approach (chosen: A — incremental masks + naked-single cascade)

Alternatives considered and rejected:

- **B — full arc-consistency / hidden-single propagation in the loop.** More pruning
  per node but more bookkeeping and per-node cost; for a *solver* (vs grader) the
  naked-single cascade already prunes the tree enough. YAGNI.
- **C — forward-checking only, no cascade.** Eliminates from peer masks but does not
  cascade forced singles or detect empty domains early. Leaves most of the speedup on
  the table.

## Design

### 1. Data model & integration

A new internal search state pairs the `Board` with a candidate-mask array
`cand: [u32; MAX_CELLS]`. Bit `v-1` set ⇒ digit `v` is still possible in that cell
(mirrors the `u32` masks already used in `techniques.rs`; `MAX_N = 16` fits in `u32`).

Masks encode **only the monotonic unit constraints**: row, column, box, and — when
`variant.diagonals` — the two diagonals. Cage-sum logic is deliberately **not** in the
masks (see correctness invariant).

`solve_variant`'s public signature and the `SolveOutcome` enum are **unchanged**.
Internally it constructs the state, seeds masks from the givens, and calls the new
propagating `search`. The `solve` classic shim is untouched. All 9×9/6×6 call sites
and the three CLI binaries see no API change.

### 2. Propagation + search algorithm

- **Seed:** for each empty cell, `mask = { v : v not already present in its
  row / col / box / (diag if applicable) }`. Filled cells have an empty/ignored mask.
- **Assign `(r,c) = v`:** clear bit `v` from every peer's mask (peers = same row, col,
  box, and diagonal(s) if applicable). Any *empty* peer that collapses to exactly one
  candidate is pushed onto a cascade stack (naked-single propagation). An empty mask on
  an empty cell ⇒ contradiction → prune this branch.
- **Cascade:** drain the stack, assigning forced singles and propagating each, until
  the stack empties or a contradiction is hit. For cage variants, a forced single must
  still pass `variant.can_place` (cage sum); failure ⇒ contradiction.
- **Branch:** pick the empty cell with the fewest candidates (MRV — now O(cells) over
  masks, not an O(n⁴) `can_place` rescan). Branch candidate set = the cell's mask bits;
  **for cage variants, intersected with `variant.can_place`** so cage-sum constraints
  gate every assignment.
- **Undo:** snapshot the mask array per node and track cascade-assigned cells; restore
  masks and clear those board cells on backtrack.
- **Solution counting:** stop at 2 solutions exactly as today, preserving
  `Unique` / `Multiple` / `Unsolvable` detection. The first solution found is retained
  as the `Unique(Board)` payload.

### 3. Correctness invariant (non-negotiable)

The new solver MUST return an identical `SolveOutcome` (same variant, same `Board`
payload) as the current solver on every input.

- **Non-cage variants (classic / X / jigsaw)** — the only variants that use
  `solve_variant` for generation. The mask is *by construction* exactly the set
  `can_place` returns: both encode "digit not present in row/col/box/diag." So the
  propagating solver explores the identical candidate set, just computed incrementally
  → byte-identical outcome. The masks are sound because they encode only monotonic
  constraints (a digit excluded by a unit at a node stays excluded in that subtree;
  peers only get more filled), so a candidate is never wrongly dropped.
- **Cage variants (killer)** — masks prune only the monotonic part; every actual
  assignment (branch and cascade) is still gated by full `can_place`, cage sum
  included. Cages get no mask-level propagation but remain correct. Killer generation
  never calls `solve_variant` anyway (it uses `grade_variant` in its carve loop), so
  this costs no real-world performance.

### 4. Testing

- **Differential test (the correctness gate):** keep the current solver temporarily as
  `solve_variant_naive`. A test asserts `solve_variant ≡ solve_variant_naive`
  (`SolveOutcome` equality) across thousands of seeded-random puzzles spanning
  n = 6 / 9 / 16 and all variants (classic, X, jigsaw, killer). Once green, the naive
  version is deleted.
- **Regression:** all existing solver and generator tests stay green, unchanged.
- **Benchmark (timed, `--ignored` test or bench):** report wall-clock for
  (a) a single 16×16 uniqueness check at realistic clue counts, and
  (b) end-to-end 16×16 `generate_variant` with the n>9 floor lowered/removed.

### 5. Deliverable & decision gate

The faster solver ships. The 16×16 generation/grading numbers are brought back, and we
decide together whether per-request 16×16 is fast enough to expose at the server/web
layer or whether it needs the Postgres pool (#5). The n>9 clue floor in `generator.rs`
is revisited based on those numbers, not removed blindly.

## Files touched

- `engine/src/solver.rs` — propagating search, mask state, seed/assign/cascade/undo;
  `solve_variant_naive` kept temporarily; differential + benchmark tests.
- `engine/src/generator.rs` — only if the benchmark warrants revisiting the n>9 floor
  (decision-gated, may be a no-op this round).

No server or web changes this round.

## Success criteria

1. Differential test green: new solver ≡ old solver across n=6/9/16, all variants.
2. All existing engine tests green, unchanged.
3. CI gates pass (`cargo fmt`, `cargo clippy`, `cargo test --release`).
4. Measured 16×16 numbers reported, with a recommendation on the 16×16 ship path.
