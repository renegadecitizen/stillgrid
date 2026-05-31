# Board-Size Generalization (6×6 + 16×16)

**Date:** 2026-05-31
**Status:** Design approved, pending spec review
**Roadmap item:** Phase 2 #3 ("Mini 6×6 variant")

## Summary

Generalize the engine's hardcoded `N=9` / `CELLS=81` so a board can be any
size `n ∈ {6, 9, 16}`, then surface **all four variants (classic, X-Sudoku,
jigsaw, killer) at all three sizes** in the product — 12 size×variant
combinations. There must be **zero behavioral change at `n=9`**: every existing
9×9 test passes unchanged.

This is the multi-day refactor CLAUDE.md and `variant.rs:11` defer. This spec
*is* that refactor.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Full generalization, sizes 6/9/16 | User wants 6×6 *and* 16×16 as real targets |
| Representation | **B: fixed max-capacity buffer + runtime `n`** | Keeps `Board: Copy` for cheap solver backtracking; stable Rust, no generics, no heap churn; smallest conceptual change to 2,568-line `techniques.rs` |
| UI matrix | All 4 variants × all 3 sizes (12 combos) | Engine supports all once generalized |
| 16×16 symbols | **`1–9` then `A–G`** (display only; internal digits stay `1..=16`) | Familiar 1–9; maps cleanly to `1..=16`; avoids `0`-as-empty clash that hex `0–F` causes |
| Daily challenge | **Stays 9×9 only** | One quiet puzzle per variant per day; sizes 6/16 are free-play; preserves streak schema |

### Rejected alternatives

- **Representation A (runtime `n` + `Vec`)** — loses `Board: Copy`; every
  backtrack node heap-allocates. Cleaner signatures aren't worth the perf hit.
- **Representation C (const generics `Board<const N, const CELLS>`)** — zero
  waste and fastest, but generic params infect every signature across
  `techniques.rs`/solver/generator. Most churn, worst readability, for perf
  that is irrelevant at these sizes (9×9 already solves in microseconds).
- **Daily per size / daily size-rotation** — fractures streaks or adds a
  rotation rule for little benefit; deferred.
- **Parallel 6×6 module** — cheap (~1 day) but a dead end for 16×16; rejected
  the moment full generalization was chosen.

## Architecture

Three layers, implemented in order. Each is independently testable.

```
engine/ (Rust)  ── N-agnostic board/variant/solver/generator/techniques
   │  binaries carry/infer `size`
   ▼
server/ (TS)    ── /api/* gains `size`; daily stays 9×9
   │
   ▼
web/ (React)    ── size selector, n-scaled board + digit pad, storage v-bump
```

## Layer 1 — Engine generalization

### `board.rs`
- New constants: `pub const MAX_N: usize = 16;` `pub const MAX_CELLS: usize = 256;`
- `pub struct Board { pub n: u8, pub cells: [u8; MAX_CELLS] }` — **stays `Copy`**.
  Only the first `n*n` cells are live.
- `get/set` index `r * self.n as usize + c`; all iteration runs `0..n*n`.
- **Symbol map** (single source of truth, used by serialization and mirrored in
  TS/web):
  - `0 → '.'`
  - `1..=9 → '1'..='9'`
  - `10..=16 → 'A'..='G'`  (i.e. `b'A' + (d - 10)`)
- `from_str` infers `n` from trimmed length: `36→6`, `81→9`, `256→16`
  (lengths are unambiguous). Reject any other length.
- `to_string_dotted` emits the symbol map.

### `variant.rs`
- `Variant` gains `n: u8`, `box_h: u8`, `box_w: u8`.
- `box_dims(n) -> (u8, u8)`: `6→(2,3)`, `9→(3,3)`, `16→(4,4)`.
- `box_of: [u8; MAX_CELLS]`; `boxes: Vec<Vec<usize>>` (built once; uniformly
  handles classic, jigsaw, and any size). The `[[usize;9];9]` fixed array is
  replaced.
- Constructors become size-parameterized: `classic(n)`, `xsudoku(n)`,
  `jigsaw(n, …)`, `killer(n, …)`.
- Diagonals remain valid at any `n` (the diagonal always has `n` cells).
- **Delete** the "deferred refactor" doc-comment at the top of the file.
- **Cage soundness invariants from CLAUDE.md are preserved verbatim** — a cage
  is still not an all-`n` unit; hidden-single / hidden-pair / bilocal *strong*
  links still skip cages; naked pairs and same-unit *weak* links stay valid.

### `techniques.rs` (the large one — 2,568 lines)
- `Candidates.masks: [u32; MAX_CELLS]` — **u32 is mandatory** (`u16` has only
  bits 0–15 and physically cannot hold digit 16).
- `ALL` is computed from `n`, not the hardcoded `0b11_1111_1110`:
  `((1u32 << (n + 1)) - 2)` → bits `1..=n` set, bit 0 clear.
- Chain-graph arrays (`node_of`, etc.) resize to `MAX_N` / `MAX_CELLS`; all
  digit loops become `1..=n`.
- Every unit (row/col/box/diag/cage) already derives from the `Variant`, so the
  technique *logic* is largely size-agnostic once the constants are
  parameterized. Tier definitions (T1–T5) are unchanged.

### `solver.rs` / `generator.rs`
- Solver: replace `CELLS`/`N` with values derived from `board.n`; backtracking
  unchanged (still `Copy` snapshots).
- Generator: `generate_variant(n, kind, …)`. Given-count targets and symmetry
  scale with `n`. Killer cage sizing tuned per size (small at 6×6, large at
  16×16).

### Binaries (`bin/*.rs`)
- stdin-JSON and output carry/infer `size`. Classic argv path keeps defaulting
  to 9 for back-compat with current callers.

## Layer 2 — Server

- `engine.ts`: `GradeInput` and the generate/solve wrappers gain a `size`
  field. Variant requests already send JSON on stdin — add `n`. The classic
  argv path stays 9×9.
- `index.ts` routes:
  - `/api/puzzle?variant=<v>&tier=<t>&size=<6|9|16>` — **`size` defaults to 9**.
  - `/api/solve`, `/api/grade` infer `n` from input length.
- **Daily unchanged**: `dailySeed(date, kind)` stays 9×9 across the 4 kinds.
  Sizes 6/16 are free-play only.

## Layer 3 — Web

- **Size selector** (`6 / 9 / 16`) added above the existing variant selector;
  the active pick is `(size, variant)`. Quiet-pill styling, sage accent.
- **Board rendering**: grid generalizes to `n` columns; thick box borders derive
  from `box_h × box_w`. The symbol map mirrors the engine's.
- **16×16 is the layout-pressure case**, not 6×6:
  - Cell-size floor + responsive scaling; pinch/scroll affordance on narrow
    viewports (256 cells won't fit an iPhone width otherwise).
  - Digit pad wraps to two rows (`1–9, A` / `B–G`) — ties into the known
    mobile digit-pad wrap issue (roadmap #6).
- **Pencil marks** scale to `n` candidates (smaller mark font at 16×16).
- **`storage.ts`**: best-times / streaks / current-run keys gain a `size`
  dimension → schema becomes keyed by `(size, variant)`. **localStorage version
  bump**; existing records migrate as `size=9` (no data loss).
- **`analytics.ts`**: add a `size` prop to existing events — **no new event
  names**, just a property. (Update the taxonomy table in the Plausible spec.)

## Difficulty grading per size

- Reuse the existing tier→label mapping. 6×6 won't reach high tiers (singles +
  pairs solve nearly all of them); 16×16 exercises the full ladder.
- Labels are **per-size** — a 6×6 "Hard" does not claim parity with a 9×9
  "Hard." Per-size tier→label calibration is empirical tuning against generated
  samples, done after the engine works.

## Testing & regression strategy

- **Hard gate:** all existing 9×9 Rust tests pass unchanged with `n=9` default.
- New engine tests: generate → solve → grade round-trip for `n=6` and `n=16`
  across all 4 variants; assert unique solution + grades `Solved`.
- Serialization round-trip tests for the `A–G` symbol map at `n=16` (incl.
  `from_str`/`to_string_dotted` and length-based `n` inference).
- Perf-guard test bounding 16×16 generation + grading time.

## Risks & out-of-scope

1. **16×16 performance** — uniqueness-checked backtracking generation and
   chain-based grading over 256 cells may be slow. Mitigation: iteration/time
   caps; a 16×16 that grades `Stuck` under the cap is acceptable (bucketed as
   hardest). If per-request spawning is too slow, that strengthens the case for
   roadmap #5 (Postgres puzzle pool) — **but the pool is out of scope here.**
2. **Killer cages at the extremes** — tiny at 6×6, large at 16×16; cage-sum
   combination pruning cost grows with cage size. Per-size generation tuning.
3. **SEO landing pages stay 9×9-framed** — no new prerendered pages in this
   scope.
4. **localStorage migration** must not wipe existing 9×9 records (migrate as
   `size=9`).

## Implementation phasing (for the plan)

0. **16×16 perf spike (early)** — once `generate_variant`/`grade_variant` accept
   `n=16`, measure real generate + grade wall-time across variants before
   building server/web on top. If it blows the per-request budget, decide
   caps/pool *before* the UI work, not after.
1. **Engine** — board/variant/solver/generator/techniques generalized + full
   test suite (incl. 6×6 and 16×16 round-trips). The hard gate lives here.
2. **Server** — `size` plumbing through `/api/*`; daily untouched.
3. **Web** — size selector, n-scaled board + digit pad, 16×16 responsive
   treatment, storage version bump + migration, analytics `size` prop.
