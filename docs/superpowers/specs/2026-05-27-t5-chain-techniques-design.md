# T5 Chain-Based Techniques — Design

**Date:** 2026-05-27
**Phase:** Phase 2, roadmap item #1 (per CLAUDE.md)
**Author:** Brainstormed with Claude
**Status:** Approved, ready for implementation planning

## Goal & Success Criterion

Close the "stuck" grading gap on Inkala-class hard sudoku puzzles by adding three chain-based techniques to `engine/src/techniques.rs`:

1. Simple coloring
2. Forcing chains
3. Almost Locked Sets (ALS)

**Acceptance test:** The canonical 2012 Arto Inkala "World's Hardest Sudoku"
`8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..`
grades as `GradeOutcome::Solved { tier: Tier::T5Nightmare, .. }` instead of `Stuck`.

**No frontend changes required.** The `Tier::T5Nightmare` variant already exists in [engine/src/techniques.rs:46](engine/src/techniques.rs:46), the `tier_label: "nightmare"` string is already in the server's `GradeResult` type at [server/src/engine.ts:85](server/src/engine.ts:85), and the web's per-tier weight (`nightmare: 16`) is already set in [web/src/App.tsx](web/src/App.tsx). The scaffolding has been waiting for techniques.

## Architecture — The Chain Graph

A new module-private struct `ChainGraph` lives in `engine/src/techniques.rs` alongside `PeerTable` and `Candidates`. It encodes the candidate-level inference relationships all three techniques need, so we build inference primitives once and three techniques query them.

```rust
struct ChainGraph {
    /// node_of[cell_index][digit-1] -> node id, or NONE_NODE if no candidate
    node_of: [[u16; N]; CELLS],
    /// One node per (cell, digit) candidate still in Candidates.
    nodes: Vec<Node>,           // Node { cell: u16, digit: u8 }
    /// strong[n] = nodes that are TRUE iff n is FALSE
    /// (within some unit: bivalue cell, or bilocal unit). Symmetric.
    strong: Vec<Vec<u16>>,
    /// weak[n] = nodes that must be FALSE if n is TRUE
    /// (cell + unit peer relationships). Symmetric.
    weak: Vec<Vec<u16>>,
}
```

**Construction.** Built once per `try_step` invocation, lazily — only constructed if T1–T4 techniques fail to find a step, since T1–T4 dominate ~99% of solve steps and don't need the graph. Derived from current `Candidates` + `PeerTable` + the variant `Unit` list.

**Strong links** are sourced from:
- Bivalue cells: cell with exactly two candidates `a, b` → strong link between `(cell, a)` and `(cell, b)`.
- Bilocal units: a unit (row, col, box, diagonal, cage) with exactly two cells where digit `d` is a candidate → strong link between those two `(cell, d)` nodes.

**Weak links** are sourced from:
- Same-cell, other candidates: a cell with `k` candidates contributes `C(k,2)` weak links.
- Same-unit, same-digit peers: any two cells in the same unit that both have digit `d` as a candidate → weak link between their `(cell, d)` nodes.

**Variant scope.** Strong and weak links derive from the existing variant-aware `Unit` list and `PeerTable`. Row, column, box, diagonal (X-Sudoku), and cage (Killer) units all contribute. Custom Jigsaw regions flow through the same `Unit::Box` path the existing techniques use. No technique is classic-only.

**Cost.** At most `CELLS * N = 729` nodes. Edge lists are sparse; total graph memory is bounded.

Each new finder function takes `&ChainGraph` and returns `Option<Step>`, mirroring the existing `find_xwing`, `find_swordfish`, `find_xywing` signatures. The orchestrator `try_step` builds the graph once on entry to the T5 layer and passes it down.

## The Three Techniques

### Commit 1 — Simple Coloring + the Chain Graph

For one digit `d` at a time, 2-color the strong-link subgraph restricted to nodes carrying digit `d`. Use BFS/DFS, alternating colors at each strong link.

**Two contradiction patterns:**
1. *Color trap:* Two nodes of the same color share a weak link (see each other on a unit). That color is invalid → eliminate every candidate of that color.
2. *Color wrap:* Two nodes of the same color land in the same unit. Same conclusion.

**Eliminations follow** for every candidate carrying the bad color. One coloring sweep can produce many eliminations in a single `Step`.

Adds `Technique::Coloring` to the enum, maps to `Tier::T5Nightmare` in `Technique::tier()`. Step type is `Step::Elimination`.

**Tests:**
- 3 hand-built minimal coloring fixtures, one per contradiction pattern.
- Regression: every currently-passing T1–T4 puzzle in the existing test suite still grades at its current tier (coloring should never fire when easier techniques work).

### Commit 2 — Forcing Chains + the Inkala Fixture

Alternating strong/weak link walks starting from any candidate. Sequence: `strong, weak, strong, weak, …`. Each strong link is a deduction ("if A is false, B must be true"); each weak link is an exclusion ("if B is true, C must be false").

**Two flavors:**
- *AIC (Alternating Inference Chain):* If a walk from `start` reaches `end` and `start.weakly_sees(end)`, then `start ∨ end` is forced, and any candidate that weakly sees both can be eliminated.
- *Bivalue forcing:* For a bivalue cell `{a, b}`: walk one chain assuming `a`, another assuming `b`. Any elimination both chains agree on is forced.

**Bounded depth.** Iterative deepening up to depth 12. Empirically (per published sudoku-solver work, e.g. Hodoku) Inkala-class puzzles need depth 6–10. Depth 12 leaves margin; deeper would risk exponential blowup with marginal coverage gain. If the Inkala test fails at depth 12, depth becomes a tunable rather than ship-blocker.

Adds `Technique::ForcingChain`, maps to `Tier::T5Nightmare`.

**Tests:**
- The 2012 Inkala fixture asserts `Solved { tier: T5Nightmare }`.
- 2 mid-difficulty puzzles that require chains but not ALS (sourced during implementation from the Hodoku reference set).
- Regression on prior commits — coloring tests still pass.

### Commit 3 — ALS (Conditional)

Almost Locked Set: `N` cells in a unit with `N+1` candidates total. If the "extra" candidate is fixed externally, the remaining N candidates lock into the N cells. Used as a more general form of XY-Wing/Swordfish.

**Implementation.** Enumerate unit subsets up to size 5 (larger subsets are theoretically possible but practically rare and expensive); detect ALS structure; chain ALSes via shared "restricted common candidates" to find eliminations.

Adds `Technique::Als`, maps to `Tier::T5Nightmare`.

**Conditional ship rule.** Only land this commit if measurement after commit 2 shows it's needed. The measurement:

```bash
# Run generator + grader on 1000 nightmare-candidate puzzles per variant
for v in classic xsudoku jigsaw killer; do
  for i in $(seq 1 1000); do
    P=$(stillgrid-generate --variant $v --seed $i)
    echo "$P" | stillgrid-grade
  done | grep -c stuck
done
```

If any variant shows >0% stucks after commit 2, ALS lands. If all show 0%, ALS is deferred (documented as known limitation, T5 closes the Inkala+pool gap without it).

**Tests (if shipped):**
- 2 hand-built ALS fixtures (one classic ALS-XY, one ALS-XZ).
- Whichever stuck-in-prod puzzle motivated ALS becomes a regression test.

## Shipping & Verification

Three branches, three PRs, each fast-forward merged to `main` after local tests pass. Render auto-deploys per push.

| Commit | Branch | Scope | Gate |
|---|---|---|---|
| 1 | `t5-coloring` | ChainGraph struct + simple coloring + 3 tests | `cargo test --release` green, `cargo clippy -- -D warnings` clean, no tier regressions on existing test fixtures |
| 2 | `t5-forcing-chains` | Forcing chains + Inkala fixture + 2 mid-difficulty tests | Inkala grades T5Nightmare locally; 100-puzzle sample per variant shows reduced stuck rate vs commit 1 baseline |
| 3 (conditional) | `t5-als` | ALS + 2 fixtures | Triggered only if commit-2 stuck-rate measurement is >0% on any variant; otherwise skipped and documented as a follow-up if ever needed |

Per memory `confirm-before-main-push`: ask for explicit per-action approval before each push to `main`.

### Performance Budget

- **Target:** <500ms total wall-clock per `grade` call on local hardware, for any puzzle the engine can grade.
- **Alarm threshold:** >2s on Inkala. If commit 2 measurement crosses this, the depth cap drops (currently 12) to the largest value that keeps Inkala under 500ms, and the test bar adjusts to match. Speed beats coverage when the median puzzle stays solvable.
- **Inner-loop bounds:** coloring is O(nodes × avg degree); forcing chains O(nodes × depth × avg degree). Bounded structurally by `nodes ≤ CELLS × N = 729` and `depth ≤ 12`.
- **Server interaction:** the `/api/puzzle` retry loop already tolerates per-attempt latency in the hundreds of ms — see [server/src/index.ts:76](server/src/index.ts:76). No API contract changes needed.

### Test Strategy Summary

- Existing tests in `engine/src/techniques.rs` (lines 921–1133) all keep passing — they verify lower-tier puzzles grade at their existing tier. Adding T5 must not push them up to T5.
- New T5 tests live in the same `#[cfg(test)] mod tests` block at the bottom of `techniques.rs`, grouped by technique.
- The Inkala fixture is the load-bearing acceptance test for commit 2.
- The stuck-rate measurement is empirical, not a unit test — it informs the commit-3 decision.

## Non-Goals (Explicit)

- **No new player-facing UI.** The "nightmare" tier label, color, and weight already exist; T5 puzzles will simply start appearing where today the system would fall back to a lower tier or `stuck`.
- **No cage-sum techniques for Killer.** That's roadmap item #2, a separate phase. Killer puzzles whose grading depends on cage-sum logic (45-rule, innies/outies) will continue to stuck unless they also yield to a chain technique.
- **No engine rewrite or generalization to 6×6 / 16×16.** Those are roadmap item #3, multi-day.
- **No nested chains, Trial-and-Error, or backtracking dressed as a technique.** If forcing chains + ALS can't grade a puzzle, it stays `stuck`. We're closing the practical gap, not aiming for theoretical completeness.

## Open Questions Worth Revisiting

- After commit 2 ships, if the Inkala fixture passes but the stuck-rate stays >0%, the commit-3 ALS decision becomes worth reviewing: do we ship ALS or accept the residual?
- If the depth-12 cap turns out insufficient on commit 2, we make depth a config parameter rather than hard-code a higher value.

## Out of Scope for This Spec

The implementation plan — exact test names, file structure, helper utilities, edge cases — is left for the writing-plans skill to generate from this design.
