# T5 Chain Techniques — Commit 2: Forcing Chains + Inkala Fixer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `find_forcing_chain` (AIC + bivalue forcing) on top of the existing `ChainGraph` so Inkala's "World's Hardest Sudoku" flips from `Stuck` to `Solved { tier: T5Nightmare }`.

**Architecture:** Depth-bounded DFS over the alternating strong/weak edges of the per-grade `ChainGraph` built in commit 1. Two flavors: Alternating Inference Chains (AIC) — chain ends on a strong link, the two endpoints disjoin, candidates weakly seeing both are eliminated; and bivalue forcing — propagate each branch of a bivalue cell independently and intersect the false sets to find forced eliminations. Both flavors share a depth cap of 12 to bound exponential blowup. Wired into `try_step` after `find_simple_coloring`.

**Tech Stack:** Rust 2021. Same `#[cfg(test)] mod tests` block as commit 1. No new dependencies.

**Branch:** `t5-forcing-chains` (off `main`)

**Source spec:** [docs/superpowers/specs/2026-05-27-t5-chain-techniques-design.md](docs/superpowers/specs/2026-05-27-t5-chain-techniques-design.md) — section "Commit 2 — Forcing Chains + the Inkala Fixture".

**Preceding commit:** [docs/superpowers/plans/2026-05-27-t5-coloring-commit-1.md](docs/superpowers/plans/2026-05-27-t5-coloring-commit-1.md) — `ChainGraph`, `Node`, `build_chain_graph`, `find_simple_coloring` are already on `main` as of `697a029`.

---

## File Structure

This commit modifies exactly one file:

- **Modify:** `engine/src/techniques.rs`
  - Add `Technique::ForcingChain` to the enum (line 12-41) and the `T5Nightmare` tier mapping (line 52-66).
  - Add `find_aic`, `find_bivalue_forcing`, `find_forcing_chain`, and helper `simulate_forcing_branch` near the existing `find_simple_coloring` (above the `// --- main loop ---` comment at line 1108).
  - Replace the inner closure of `try_step` (lines 1119-1123) to chain `find_forcing_chain` after `find_simple_coloring`.
  - Delete two now-incorrect tests (`inkala_still_stuck` at line 1205-1209, `inkala_still_stuck_after_coloring` at line 1576-1585). Append new fixture tests + acceptance tests at the bottom of `mod tests`.

No new files. No changes to `board.rs`, `variant.rs`, `solver.rs`, `generator.rs`, the server, or the web.

---

## Task 0: Branch off main

**Files:** (none)

- [ ] **Step 1: Verify clean working tree on main**

Run:
```bash
cd /Users/robertmccrady/stillgrid
git status
```
Expected: `On branch main` and `nothing to commit, working tree clean`. If unclean, stop and report; do not stash.

- [ ] **Step 2: Pull latest main**

Run:
```bash
git pull --ff-only origin main
```
Expected: `Already up to date.` or a clean fast-forward. If non-fast-forward, stop and report.

- [ ] **Step 3: Verify commit 1 is the head**

Run:
```bash
git log -1 --oneline
```
Expected: head includes the coloring work (e.g., `697a029 Polish: honest DFS comment + remove always-true guards in coloring` or later if more polish landed).

- [ ] **Step 4: Create and switch to the branch**

Run:
```bash
git checkout -b t5-forcing-chains
```
Expected: `Switched to a new branch 't5-forcing-chains'`.

---

## Task 1: Add `Technique::ForcingChain` variant + tier mapping

**Files:**
- Modify: `engine/src/techniques.rs:12-41` (enum), `:52-66` (`impl Technique`), bottom of `mod tests` block (line 1586).

- [ ] **Step 1: Write the failing test**

Append to the `mod tests` block at the bottom of `engine/src/techniques.rs` (after the existing `inkala_still_stuck_after_coloring` test, before the final `}` of `mod tests`):

```rust
    #[test]
    fn forcing_chain_tier_is_t5() {
        assert_eq!(Technique::ForcingChain.tier(), Tier::T5Nightmare);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd engine && cargo test --release forcing_chain_tier_is_t5 2>&1 | tail -10
```
Expected: compile error — `no variant or associated item named 'ForcingChain' found for enum 'Technique'`.

- [ ] **Step 3: Add the enum variant**

In `engine/src/techniques.rs`, locate the `pub enum Technique` block (starts at line 12). Add a new line after `Coloring,` and before the closing `}`:

```rust
    // Tier 5 — chain-based
    Coloring,
    ForcingChain,
}
```

- [ ] **Step 4: Add the tier mapping**

In `engine/src/techniques.rs`, locate `impl Technique { pub fn tier(self) -> Tier {` (line 52). Extend the `Coloring` arm to include `ForcingChain`:

```rust
            SwordfishRow | SwordfishCol | XYWing => Tier::T4Diabolical,
            Coloring | ForcingChain => Tier::T5Nightmare,
        }
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
cd engine && cargo test --release forcing_chain_tier_is_t5 2>&1 | tail -10
```
Expected: `test tests::forcing_chain_tier_is_t5 ... ok` and `test result: ok. 1 passed`.

- [ ] **Step 6: Run full test suite to verify no regression**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -15
```
Expected: every existing test still passes (`easy_still_easy`, `inkala_still_stuck`, `inkala_still_stuck_after_coloring`, all the chain-graph + coloring tests added in commit 1, plus the new tier test). No failures.

- [ ] **Step 7: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add Technique::ForcingChain enum variant mapped to T5Nightmare"
```

---

## Task 2: Implement `find_aic` with smoke test

**Files:**
- Modify: `engine/src/techniques.rs` — add `find_aic` and `aic_dfs` above the `// --- main loop ---` comment (line 1108). Append smoke test to `mod tests`.

**Background — what we're building.** An Alternating Inference Chain (AIC) is a sequence of nodes connected by edges that strictly alternate between strong and weak, with the first and last edges both **strong**. The chain has the property: if its first node (`start`) is FALSE, then the last node (`end`) is forced TRUE. Therefore `start ∨ end` holds. Any candidate that has a weak link to BOTH `start` and `end` cannot be TRUE (it would force both endpoints FALSE), so it is eliminated.

Strong link in our graph (from commit 1) = "exactly one of the two endpoints is TRUE" (bivalue cell or bilocal unit). Weak link = "at most one is TRUE" (intra-cell other digit, or same-unit same-digit peer). With this construction, "FALSE end of a strong link forces the other end TRUE" holds — that's the propagation engine for AIC.

For chain of length `k` edges, AIC needs `k` odd (S, S-W-S, S-W-S-W-S, …). We cap depth at 12 edges, so we look at chains of length 1, 3, 5, 7, 9, 11. Length-1 AICs are already subsumed by simple coloring for same-digit pairs; the search will still find them but coloring runs first in `try_step`, so they only matter when the two endpoints carry different digits (cross-digit, missed by per-digit coloring).

- [ ] **Step 1: Write the smoke test**

Append to the `mod tests` block:

```rust
    /// Smoke: `find_aic` exists, takes a `&ChainGraph`, returns Option<Step>,
    /// and is robust on degenerate input (empty graph) — must not panic.
    #[test]
    fn find_aic_smoke_empty_graph() {
        let peers = PeerTable::build(&Variant::classic());
        let c = Candidates { masks: [0u16; CELLS] };
        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        let result = find_aic(&g);
        assert!(result.is_none(), "empty graph should produce no AIC");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd engine && cargo test --release find_aic_smoke 2>&1 | tail -10
```
Expected: compile error — `cannot find function 'find_aic'`.

- [ ] **Step 3: Add `find_aic` + `aic_dfs`**

In `engine/src/techniques.rs`, insert directly above `// --- main loop ---` (line 1108):

```rust
// --- Tier 5: alternating inference chains (AIC) -------------------------
//
// Walk the ChainGraph along strictly alternating strong/weak edges,
// starting and ending on a strong link. If a chain of length 1, 3, 5,
// ..., 11 reaches a node whose weak-link neighborhood intersects the
// start's weak-link neighborhood, those shared weak peers cannot be
// true: one of {start, end} is forced true, so any peer weakly seeing
// both is forced false. Depth capped at 12 edges (chain length 11
// nodes-on-strong) per the spec; deeper would risk exponential
// blowup with marginal gain.

const AIC_MAX_EDGES: usize = 12;

fn find_aic(g: &ChainGraph) -> Option<Step> {
    let mut path: Vec<u16> = Vec::with_capacity(AIC_MAX_EDGES + 1);
    let mut on_path: Vec<bool> = vec![false; g.nodes.len()];
    for start in 0..g.nodes.len() {
        path.clear();
        for v in on_path.iter_mut() { *v = false; }
        path.push(start as u16);
        on_path[start] = true;
        if let Some(step) = aic_dfs(g, start, &mut path, &mut on_path) {
            return Some(step);
        }
    }
    None
}

/// DFS extending `path` with strictly alternating strong/weak edges.
/// path.len() - 1 == current edge count.
/// Next edge is STRONG when current edge count is even (0, 2, 4, ...),
/// WEAK when odd (1, 3, 5, ...). At odd edge counts >= 1 we have a
/// valid AIC endpoint (chain ended on a strong link) — check victims.
fn aic_dfs(
    g: &ChainGraph,
    start: usize,
    path: &mut Vec<u16>,
    on_path: &mut Vec<bool>,
) -> Option<Step> {
    let depth = path.len() - 1; // number of edges traversed so far
    let last = *path.last().unwrap() as usize;

    // Valid AIC endpoint: odd edge count, last edge was STRONG.
    if depth >= 1 && depth % 2 == 1 {
        if let Some(step) = aic_check_victims(g, start, last, on_path) {
            return Some(step);
        }
    }

    if depth >= AIC_MAX_EDGES {
        return None;
    }

    // Choose edge type: even depth -> next must be STRONG, odd -> WEAK.
    let next_is_strong = depth % 2 == 0;
    let edges = if next_is_strong { &g.strong[last] } else { &g.weak[last] };
    for &next in edges {
        let next = next as usize;
        if on_path[next] { continue; }
        on_path[next] = true;
        path.push(next as u16);
        if let Some(step) = aic_dfs(g, start, path, on_path) {
            return Some(step);
        }
        path.pop();
        on_path[next] = false;
    }
    None
}

/// Return Some(elimination) if any candidate weakly sees both `start` and
/// `end` (and is not on the chain). `start ∨ end` is the AIC's conclusion;
/// such a victim cannot be true.
fn aic_check_victims(
    g: &ChainGraph,
    start: usize,
    end: usize,
    on_path: &[bool],
) -> Option<Step> {
    if start == end { return None; }
    let mut removed: Vec<(usize, usize, u8)> = Vec::new();
    for victim in 0..g.nodes.len() {
        if on_path[victim] { continue; }
        let sees_start = g.weak[victim].iter().any(|&n| n as usize == start);
        if !sees_start { continue; }
        let sees_end = g.weak[victim].iter().any(|&n| n as usize == end);
        if !sees_end { continue; }
        let cell = g.nodes[victim].cell as usize;
        removed.push((cell / N, cell % N, g.nodes[victim].digit));
    }
    if removed.is_empty() {
        return None;
    }
    Some(Step::Elimination {
        technique: Technique::ForcingChain,
        removed,
    })
}
```

- [ ] **Step 4: Run smoke test**

Run:
```bash
cd engine && cargo test --release find_aic_smoke 2>&1 | tail -10
```
Expected: `test tests::find_aic_smoke_empty_graph ... ok`.

- [ ] **Step 5: Run full suite + clippy**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -10 && cargo clippy --release -- -D warnings 2>&1 | tail -10
```
Expected: all tests pass, clippy clean. If clippy flags the `.any(|&n| n as usize == ...)` pattern as `iter().any(|x| ... == ...)` → prefer `contains(&...)`, that's a stylistic warning we can silence by switching to `g.weak[victim].contains(&(start as u16))`. Either form is correct; use whichever clippy is happy with on your Rust version.

- [ ] **Step 6: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add find_aic with bounded-depth alternating chain search"
```

---

## Task 3: Behavioral test — AIC across digits actually eliminates

**Files:**
- Modify: `engine/src/techniques.rs` — append behavioral test to `mod tests`.

**Fixture design** (read this before writing the assertion so it's grounded):

We want an AIC whose two endpoints are SAME-digit but whose middle hop uses cross-digit bivalue strong links — exactly the pattern simple coloring (per-digit) cannot see.

Setup, digit 1 + digit 2 only, all other cells stripped of these digits:
- `(0, 0)` bivalue {1, 2} → intra-cell strong link `(0,0):1 ↔ (0,0):2`.
- `(3, 0)` bivalue {1, 2} → intra-cell strong link `(3,0):1 ↔ (3,0):2`.
- `(6, 0)` candidates {1, 5} → digit 1 candidate in col 0.

Col 0 bearers of digit 1: `(0,0), (3,0), (6,0)` — three cells → no col 0 strong link for digit 1 (count > 2). But pairwise weak links: `(0,0):1 ↔ (3,0):1`, `(0,0):1 ↔ (6,0):1`, `(3,0):1 ↔ (6,0):1`. Same for col 0 bearers of digit 2 = `(0,0), (3,0)`, two cells → bilocal strong link `(0,0):2 ↔ (3,0):2` (plus weak link from the same-unit relationship).

Simple coloring on digit 1 finds no strong links among `(0,0):1, (3,0):1, (6,0):1` (no two of them are bivalent or bilocal in any unit). Simple coloring on digit 2 sees the strong link `(0,0):2 ↔ (3,0):2` but no victims (no other digit-2 candidates exist).

AIC: `(0,0):1 -S- (0,0):2 -w- (3,0):2 -S- (3,0):1`. Length 3 edges (S-W-S). Endpoints are same digit (digit 1). Conclusion: `(0,0):1 ∨ (3,0):1`. Victim `(6,0):1` weakly sees both via col 0 → eliminated.

- [ ] **Step 1: Write the behavioral test**

Append to `mod tests`:

```rust
    /// AIC fixture: cross-digit chain whose endpoints are same-digit and
    /// whose middle crosses a bivalue cell. Coloring (per-digit) cannot see
    /// it; AIC can.
    ///
    /// Chain: (0,0):1 -S- (0,0):2 -w- (3,0):2 -S- (3,0):1.
    /// Conclusion: (0,0):1 ∨ (3,0):1 → eliminate (6,0):1 (col 0 weak peer).
    #[test]
    fn aic_cross_digit_eliminates() {
        let peers = PeerTable::build(&Variant::classic());
        let mut c = Candidates { masks: [0u16; CELLS] };
        c.masks[cell_index(0, 0)] = bit(1) | bit(2);
        c.masks[cell_index(3, 0)] = bit(1) | bit(2);
        c.masks[cell_index(6, 0)] = bit(1) | bit(5);
        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        let step = find_aic(&g).expect("AIC should find a chain on this fixture");
        match step {
            Step::Elimination { technique, removed } => {
                assert_eq!(technique, Technique::ForcingChain);
                let hit = removed.iter().any(|&(r, col, v)| (r, col, v) == (6, 0, 1));
                assert!(hit, "expected (6,0,1) eliminated, got {:?}", removed);
            }
            other => panic!("expected elimination, got {:?}", other),
        }
    }
```

- [ ] **Step 2: Run the test**

Run:
```bash
cd engine && cargo test --release aic_cross_digit_eliminates 2>&1 | tail -15
```
Expected: PASS.

If FAIL, the most likely causes are (a) the `aic_check_victims` `on_path` filter is incorrectly excluding the victim (it shouldn't — `(6,0):1` isn't on the chain), (b) the `find_aic` start-node iteration order matters and a different chain is being found first — print `removed` and the matched chain to diagnose. The chain length-3 from `(0,0):1` to `(3,0):1` must be discoverable; if start node `(0,0):1` doesn't find it, check that DFS extends along the bivalue strong link first.

- [ ] **Step 3: Run full suite + clippy**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -10 && cargo clippy --release -- -D warnings 2>&1 | tail -5
```
Expected: all tests pass, clippy clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add AIC cross-digit fixture test verifying elimination"
```

---

## Task 4: Implement `find_bivalue_forcing` with smoke test

**Files:**
- Modify: `engine/src/techniques.rs` — add `find_bivalue_forcing` and `simulate_forcing_branch` after `aic_check_victims`. Append smoke test to `mod tests`.

**Background — what we're building.** For each bivalue cell `{a, b}`, run two simulations: branch A assumes `(cell, a)` is TRUE; branch B assumes `(cell, b)` is TRUE. Each simulation propagates through the `ChainGraph`: a TRUE node forces all its weak-neighbors FALSE; a FALSE node, via its strong links, forces its strong-neighbors TRUE. Continue until no new nodes flip or a depth bound is reached. The simulation collects the set of nodes that became FALSE in that branch.

The intersection of `false_set_a` and `false_set_b` are the forced eliminations: a candidate that is FALSE in both branches must be FALSE, because the bivalue cell guarantees exactly one of `{a, b}` is TRUE. Bounded depth = 12 propagation rounds, matching the AIC cap.

- [ ] **Step 1: Write the smoke test**

Append to `mod tests`:

```rust
    /// Smoke: `find_bivalue_forcing` exists, runs on empty candidates,
    /// returns None, does not panic.
    #[test]
    fn find_bivalue_forcing_smoke_empty() {
        let peers = PeerTable::build(&Variant::classic());
        let c = Candidates { masks: [0u16; CELLS] };
        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        assert!(find_bivalue_forcing(&g, &c).is_none());
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd engine && cargo test --release find_bivalue_forcing_smoke 2>&1 | tail -10
```
Expected: compile error — `cannot find function 'find_bivalue_forcing'`.

- [ ] **Step 3: Add `find_bivalue_forcing` + `simulate_forcing_branch`**

In `engine/src/techniques.rs`, insert directly after `aic_check_victims` (and before `// --- main loop ---`):

```rust
// --- Tier 5: bivalue forcing chains -------------------------------------
//
// For each bivalue cell {a, b}, simulate branch A (assume a TRUE) and
// branch B (assume b TRUE) independently through the ChainGraph. Any
// candidate that is forced FALSE in BOTH branches is a confirmed
// elimination: the cell must be a or b, so one branch holds.
//
// Propagation rule:
//   * Setting node n to TRUE flips every weak-neighbor of n to FALSE.
//   * Setting node n to FALSE flips every strong-neighbor of n to TRUE
//     (because strong link == "exactly one of the two is TRUE" in our
//     construction: bivalue cell or bilocal unit).
//
// Depth cap mirrors AIC's: at most 12 BFS layers per branch.

const FORCING_MAX_DEPTH: usize = 12;

fn find_bivalue_forcing(g: &ChainGraph, c: &Candidates) -> Option<Step> {
    for cell in 0..CELLS {
        let m = c.masks[cell];
        if popcount(m) != 2 {
            continue;
        }
        let mut a: u8 = 0;
        let mut b: u8 = 0;
        for d in 1u8..=9 {
            if m & bit(d) != 0 {
                if a == 0 { a = d; } else { b = d; }
            }
        }
        let node_a = g.node_of[cell][(a - 1) as usize];
        let node_b = g.node_of[cell][(b - 1) as usize];
        if node_a == NONE_NODE || node_b == NONE_NODE {
            continue;
        }

        let false_a = simulate_forcing_branch(g, node_a as usize);
        let false_b = simulate_forcing_branch(g, node_b as usize);

        let mut removed: Vec<(usize, usize, u8)> = Vec::new();
        for n in 0..g.nodes.len() {
            if false_a[n] && false_b[n] {
                let cell_n = g.nodes[n].cell as usize;
                removed.push((cell_n / N, cell_n % N, g.nodes[n].digit));
            }
        }
        if !removed.is_empty() {
            return Some(Step::Elimination {
                technique: Technique::ForcingChain,
                removed,
            });
        }
    }
    None
}

/// BFS propagation from `start_true` assumed TRUE. Returns a bitmap of
/// nodes that this branch forces FALSE. The starting node itself is
/// recorded as TRUE, not FALSE.
fn simulate_forcing_branch(g: &ChainGraph, start_true: usize) -> Vec<bool> {
    let n = g.nodes.len();
    let mut true_set = vec![false; n];
    let mut false_set = vec![false; n];
    let mut frontier: Vec<usize> = vec![start_true];
    true_set[start_true] = true;

    for _layer in 0..FORCING_MAX_DEPTH {
        if frontier.is_empty() { break; }
        let mut next: Vec<usize> = Vec::new();
        for &nid in &frontier {
            if true_set[nid] {
                // TRUE -> weak neighbors become FALSE.
                for &peer in &g.weak[nid] {
                    let p = peer as usize;
                    if !true_set[p] && !false_set[p] {
                        false_set[p] = true;
                        next.push(p);
                    }
                    // Note: contradiction (true_set[p] true here) is
                    // possible if the starting assumption is impossible.
                    // We let that branch silently report its eliminations;
                    // the intersection with the other branch is what
                    // matters for the forcing inference. A future
                    // refinement could detect contradictions and produce
                    // a direct placement.
                }
            } else if false_set[nid] {
                // FALSE -> strong neighbors become TRUE.
                for &peer in &g.strong[nid] {
                    let p = peer as usize;
                    if !true_set[p] && !false_set[p] {
                        true_set[p] = true;
                        next.push(p);
                    }
                }
            }
        }
        frontier = next;
    }
    false_set
}
```

- [ ] **Step 4: Run smoke test**

Run:
```bash
cd engine && cargo test --release find_bivalue_forcing_smoke 2>&1 | tail -10
```
Expected: `test tests::find_bivalue_forcing_smoke_empty ... ok`.

- [ ] **Step 5: Run full suite + clippy**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -10 && cargo clippy --release -- -D warnings 2>&1 | tail -10
```
Expected: all tests pass, clippy clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add find_bivalue_forcing with intersection-of-false-sets inference"
```

---

## Task 5: Behavioral test — bivalue forcing actually eliminates

**Files:**
- Modify: `engine/src/techniques.rs` — append behavioral test to `mod tests`.

**Fixture design** (read before coding):

We want a bivalue cell `(0,0) = {1, 2}` whose two branches BOTH force the same victim FALSE via two different propagation paths.

Setup — digits 1, 2, and 5 only, all other digits cleared from these cells; the rest of the board cleared of `{1, 2, 5}`:
- `(0,0)` bivalue {1, 2}.
- `(0,4)` bivalue {1, 5}. (Sees `(0,0)` via row 0.)
- `(5,0)` bivalue {2, 5}. (Sees `(0,0)` via col 0.)
- `(5,4)` candidates {5, 6}. (Sees `(0,4)` via col 4. Sees `(5,0)` via row 5.)

Trace:

**Branch A (assume `(0,0):1` TRUE).**
- `(0,0):1` TRUE → weak peers FALSE: `(0,0):2` (intra-cell), `(0,4):1` (row 0 same-digit).
- `(0,0):2` FALSE → strong peer TRUE: `(0,0):1` (already TRUE — no-op).
- `(0,4):1` FALSE → strong peer TRUE: `(0,4):5` (bivalue).
- `(0,4):5` TRUE → weak peers FALSE: includes `(5,4):5` (col 4 same-digit).
- Result: `(5,4):5` ∈ false_a.

**Branch B (assume `(0,0):2` TRUE).**
- `(0,0):2` TRUE → weak peers FALSE: `(0,0):1`, `(5,0):2` (col 0 same-digit).
- `(5,0):2` FALSE → strong peer TRUE: `(5,0):5` (bivalue).
- `(5,0):5` TRUE → weak peers FALSE: includes `(5,4):5` (row 5 same-digit).
- Result: `(5,4):5` ∈ false_b.

Intersection: `(5,4):5` is forced FALSE — eliminate.

Note that AIC could potentially also find this elimination via a chain from `(0,4):5` to `(5,0):5`, but the fixture is designed so the bivalue starting cell is `(0,0)`, not those endpoints — the AIC discovery requires picking the right `start` and would also work, but the test asserts the behavior via `find_bivalue_forcing` directly to keep the units of code separate.

- [ ] **Step 1: Write the behavioral test**

Append to `mod tests`:

```rust
    /// Bivalue forcing fixture: both branches of (0,0)={1,2} force (5,4):5 FALSE
    /// via independent two-hop chains, so it is a forced elimination.
    ///
    /// Branch A ((0,0)=1): (0,4):1 FALSE -> (0,4):5 TRUE -> col 4 weak -> (5,4):5 FALSE.
    /// Branch B ((0,0)=2): (5,0):2 FALSE -> (5,0):5 TRUE -> row 5 weak -> (5,4):5 FALSE.
    #[test]
    fn bivalue_forcing_intersection_eliminates() {
        let peers = PeerTable::build(&Variant::classic());
        let mut c = Candidates { masks: [0u16; CELLS] };
        c.masks[cell_index(0, 0)] = bit(1) | bit(2);
        c.masks[cell_index(0, 4)] = bit(1) | bit(5);
        c.masks[cell_index(5, 0)] = bit(2) | bit(5);
        c.masks[cell_index(5, 4)] = bit(5) | bit(6);
        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        let step = find_bivalue_forcing(&g, &c)
            .expect("bivalue forcing should fire on this fixture");
        match step {
            Step::Elimination { technique, removed } => {
                assert_eq!(technique, Technique::ForcingChain);
                let hit = removed.iter().any(|&(r, col, v)| (r, col, v) == (5, 4, 5));
                assert!(hit, "expected (5,4,5) eliminated, got {:?}", removed);
            }
            other => panic!("expected elimination, got {:?}", other),
        }
    }
```

- [ ] **Step 2: Run the test**

Run:
```bash
cd engine && cargo test --release bivalue_forcing_intersection 2>&1 | tail -15
```
Expected: PASS.

If FAIL, the most likely cause is `simulate_forcing_branch` not propagating two hops: check that `(0,4):1 FALSE` triggers a strong-link flip to `(0,4):5 TRUE`, and that `(0,4):5 TRUE` then triggers weak-neighbor flips. Add a `dbg!(false_a)` / `dbg!(false_b)` to inspect.

- [ ] **Step 3: Run full suite + clippy**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -10 && cargo clippy --release -- -D warnings 2>&1 | tail -5
```
Expected: all tests pass, clippy clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add bivalue forcing fixture test verifying intersection elimination"
```

---

## Task 6: Wire `find_forcing_chain` into `try_step`

**Files:**
- Modify: `engine/src/techniques.rs` — add `find_forcing_chain` wrapper, update `try_step`. Append regression tests.

- [ ] **Step 1: Write the regression tests**

Append to `mod tests`:

```rust
    /// Easy puzzles must still grade as T1Easy after forcing chains land —
    /// chain techniques must not fire when easier techniques apply.
    #[test]
    fn easy_does_not_promote_to_t5_with_forcing_available() {
        let b = Board::from_str(EASY).unwrap();
        match grade(&b) {
            GradeOutcome::Solved { tier, .. } => assert_eq!(tier, Tier::T1Easy),
            other => panic!("expected Solved at T1Easy, got {:?}", other),
        }
    }

    /// Smoke: `find_forcing_chain` is callable and returns Option<Step>.
    #[test]
    fn find_forcing_chain_smoke() {
        let peers = PeerTable::build(&Variant::classic());
        let c = Candidates { masks: [0u16; CELLS] };
        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        assert!(find_forcing_chain(&g, &c).is_none());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd engine && cargo test --release find_forcing_chain_smoke 2>&1 | tail -10
```
Expected: compile error — `cannot find function 'find_forcing_chain'`.

- [ ] **Step 3: Add `find_forcing_chain` wrapper**

In `engine/src/techniques.rs`, insert directly after `simulate_forcing_branch` (and before `// --- main loop ---`):

```rust
fn find_forcing_chain(g: &ChainGraph, c: &Candidates) -> Option<Step> {
    find_aic(g).or_else(|| find_bivalue_forcing(g, c))
}
```

- [ ] **Step 4: Wire into `try_step`**

In `engine/src/techniques.rs`, locate `fn try_step` (line 1110). Replace its body, extending the existing lazy-chain-build closure to also call `find_forcing_chain`:

```rust
fn try_step(c: &Candidates, variant: &Variant, units: &[Unit], peers: &PeerTable) -> Option<Step> {
    find_naked_single(c)
        .or_else(|| find_hidden_single(c, units))
        .or_else(|| find_naked_pair(c, units))
        .or_else(|| find_hidden_pair(c, units))
        .or_else(|| find_pointing_pair(c, variant))
        .or_else(|| find_xwing(c))
        .or_else(|| find_swordfish(c))
        .or_else(|| find_xywing(c, peers))
        .or_else(|| {
            // Lazy: only built when T1–T4 finders all failed.
            let g = build_chain_graph(c, peers, units);
            find_simple_coloring(&g)
                .or_else(|| find_forcing_chain(&g, c))
        })
}
```

- [ ] **Step 5: Run the regression tests**

Run:
```bash
cd engine && cargo test --release easy_does_not_promote_to_t5_with_forcing 2>&1 | tail -10
cd engine && cargo test --release find_forcing_chain_smoke 2>&1 | tail -10
```
Expected: both PASS. Easy still T1Easy, smoke returns None.

- [ ] **Step 6: Run full suite + clippy**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -20 && cargo clippy --release -- -D warnings 2>&1 | tail -5
```
Expected: all existing tests still pass (every coloring test, both fixture tests for AIC + bivalue forcing, every T1–T4 puzzle test). Clippy clean.

**Note:** `inkala_still_stuck` and `inkala_still_stuck_after_coloring` may NOW START FAILING — forcing chains may crack Inkala. If they fail, this is the *expected* behavior we'll bless in Task 7. If they still pass (Inkala still grades Stuck), the technique implementation needs more horsepower — investigate before continuing.

If the two Inkala tests do fail, capture the actual outcome:
```bash
cd engine && cargo test --release inkala 2>&1 | tail -30
```
The failure message should show `assertion 'matches!(grade(&b), GradeOutcome::Stuck { .. })' failed` — confirming the puzzle now grades Solved.

- [ ] **Step 7: Commit**

If the regressions held (existing easy/swordfish/coloring tests pass), commit even if the two Inkala-stuck tests now fail — Task 7 deletes them.

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Wire find_forcing_chain into try_step (AIC then bivalue forcing)"
```

If only the two Inkala-stuck tests fail, that's expected. If any other test fails, STOP and investigate before committing.

---

## Task 7: Inkala acceptance test — flip Stuck → Solved

**Files:**
- Modify: `engine/src/techniques.rs` — delete `inkala_still_stuck` (line 1205-1209) and `inkala_still_stuck_after_coloring` (line 1576-1585). Append the new acceptance test.

**This is the load-bearing test of commit 2.** If Inkala doesn't grade `Solved { tier: T5Nightmare }` after the wire-up, commit 2 has not met its goal.

- [ ] **Step 1: Delete the now-incorrect "still stuck" tests**

In `engine/src/techniques.rs`, locate and DELETE these two tests:

```rust
    #[test]
    fn inkala_still_stuck() {
        let b = Board::from_str(INKALA).unwrap();
        assert!(matches!(grade(&b), GradeOutcome::Stuck { .. }));
    }
```

and:

```rust
    /// Inkala remains stuck after commit 1 — coloring alone is not enough.
    /// This test will be flipped to Solved in commit 2 (forcing chains).
    #[test]
    fn inkala_still_stuck_after_coloring() {
        let b = Board::from_str(INKALA).unwrap();
        assert!(
            matches!(grade(&b), GradeOutcome::Stuck { .. }),
            "Inkala should still be Stuck after coloring; chains land in commit 2"
        );
    }
```

- [ ] **Step 2: Append the new acceptance test**

Append to `mod tests` (replacing nothing; just adding):

```rust
    /// Acceptance test for T5 commit 2: the canonical 2012 Arto Inkala
    /// "World's Hardest Sudoku" must grade as Solved at T5Nightmare.
    /// This is the spec's success criterion.
    #[test]
    fn inkala_solved_at_t5_nightmare() {
        let b = Board::from_str(INKALA).unwrap();
        match grade(&b) {
            GradeOutcome::Solved { tier, .. } => {
                assert_eq!(tier, Tier::T5Nightmare,
                    "Inkala should grade T5Nightmare, got {:?}", tier);
            }
            other => panic!("Inkala should be Solved at T5Nightmare, got {:?}", other),
        }
    }
```

- [ ] **Step 3: Run the new acceptance test**

Run:
```bash
cd engine && cargo test --release inkala_solved_at_t5_nightmare 2>&1 | tail -15
```
Expected: PASS.

If FAIL with `expected Solved at T5Nightmare, got Stuck`, the chain techniques are not strong enough to crack Inkala within depth 12. Diagnostics:

1. Print the grade output via:
```bash
echo "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4.." | engine/target/release/stillgrid-grade
```
If outcome is `stuck`, examine the `tier_reached` field — if it's `4` (T4Diabolical), AIC + bivalue forcing aren't producing new eliminations from the post-T4 candidate state.

2. Add a debug printout in `find_forcing_chain` before returning — does it ever return `Some`? If never on Inkala, the chain primitives aren't finding chains; check that `build_chain_graph` produces a non-trivial graph (`g.nodes.len() > 0`, `g.strong.iter().any(|e| !e.is_empty())`).

3. If chains ARE found but eliminations don't break the deadlock, depth may need to extend (try `AIC_MAX_EDGES = 16`) or coverage may need ALS (commit 3). Per the spec, depth-12 should suffice; if it doesn't, raise the cap and re-test before considering ALS.

4. As a last resort, the spec leaves depth as a tunable. If raising to 16 fixes Inkala without exploding runtime (still <500ms), bump the constant and document the deviation in the commit message.

- [ ] **Step 4: Run full suite + clippy**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -20 && cargo clippy --release -- -D warnings 2>&1 | tail -5
```
Expected: all tests pass (including all coloring tests, both forcing fixtures, the new Inkala acceptance, and every T1–T4 regression). Clippy clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Flip Inkala from Stuck to Solved at T5Nightmare via forcing chains"
```

---

## Task 8: Performance smoke + additional chain-requiring puzzle test

**Files:**
- Modify: `engine/src/techniques.rs` — append one additional public hard-puzzle test.

- [ ] **Step 1: Performance smoke — Inkala under 500ms**

Run:
```bash
cd /Users/robertmccrady/stillgrid
cargo build --release --manifest-path engine/Cargo.toml 2>&1 | tail -3
time (echo "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4.." | engine/target/release/stillgrid-grade)
```
Expected: completes in **<500ms** real time. Output JSON should be `{"outcome":"solved","tier":5,"tier_label":"nightmare",...}`.

If real time exceeds 500ms:
- 500ms–2s: acceptable but tight; note it in the commit message. Consider profiling later.
- 2s–5s: ALARM. Likely cause is the AIC DFS hitting near-exponential branching on Inkala's dense post-T4 candidate state. Mitigate by lowering `AIC_MAX_EDGES` to 10 (or 8) and re-running the acceptance test — if Inkala still solves, ship the lower cap.
- >5s: STOP. The implementation needs a meaningful optimization (e.g., early-exit when a chain extension cannot reach any victim, or memoization of weakly-shared-peers per start node). Do not ship.

- [ ] **Step 2: Add a second chain-requiring puzzle as a regression**

Append to `mod tests`. The second hard puzzle is "Easter Monster" — another widely-cited hard sudoku that requires chain reasoning. If your implementation grades it at T5Nightmare, it provides a useful second data point; if it grades Stuck, the test documents the current coverage boundary explicitly (and we don't fail the commit on it — see step 3 for the conditional).

```rust
    /// "Easter Monster" — a hard sudoku used in the literature alongside
    /// Inkala for chain-grading benchmarks. We assert it solves at T5
    /// to confirm coverage isn't a one-puzzle fluke. If this test fails,
    /// it does not block commit 2 — Inkala is the load-bearing acceptance.
    /// Flip to a documented #[ignore] if it stucks but Inkala still solves.
    const EASTER_MONSTER: &str =
        "1.......2.9.4...5...6...7...5.9.3.......7.......85..4.7.....6...3...9.8...2.....1";

    #[test]
    fn easter_monster_solves_at_t5() {
        let b = Board::from_str(EASTER_MONSTER).unwrap();
        match grade(&b) {
            GradeOutcome::Solved { tier, .. } => {
                assert_eq!(tier, Tier::T5Nightmare,
                    "Easter Monster should grade T5Nightmare, got {:?}", tier);
            }
            other => panic!("Easter Monster should be Solved at T5Nightmare, got {:?}", other),
        }
    }
```

- [ ] **Step 3: Run the second-puzzle test**

Run:
```bash
cd engine && cargo test --release easter_monster_solves_at_t5 2>&1 | tail -15
```

**Decision branch:**

- **If PASS:** great, leave the test as-is. Continue to step 4.
- **If FAIL with `Stuck`:** chain techniques don't crack this one. Inkala-only acceptance is enough for commit 2. Edit the test to `#[ignore]` it and update its docstring to say "Documented stuck; revisit after ALS lands (commit 3) or after raising the depth cap." The test name and string stay so we can quickly un-ignore later.

  ```rust
      #[test]
      #[ignore = "Stuck after T5 commit 2 forcing chains; revisit with ALS or depth bump"]
      fn easter_monster_solves_at_t5() {
          // ... body unchanged ...
      }
  ```

- **If FAIL with `Solved` but a non-T5 tier:** unexpected, likely a test fixture quirk; the puzzle is harder than its tier suggests. Bump to a different second puzzle from a sudoku-explainer reference set, OR just delete this test and rely on Inkala. Note the decision in the commit message.

- [ ] **Step 4: Run full suite + clippy + perf smoke once more**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -20 && cargo clippy --release -- -D warnings 2>&1 | tail -5
time (echo "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4.." | engine/target/release/stillgrid-grade)
```
Expected: all tests green (or one `#[ignore]` if the second-puzzle test was ignored), clippy clean, Inkala grading still <500ms.

- [ ] **Step 5: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add Easter Monster regression + verify Inkala perf under 500ms"
```

If you ignored the Easter Monster test, use the commit message: `Add Easter Monster regression (ignored; stuck post-commit-2) + verify Inkala perf`.

---

## Task 9: Merge to main (with user confirmation)

**Files:** (none)

- [ ] **Step 1: Show diff stat and commit list to the user**

Run:
```bash
cd /Users/robertmccrady/stillgrid
git --no-pager log --oneline main..t5-forcing-chains
git --no-pager diff --stat main..t5-forcing-chains
```
Expected: 7 commits (Tasks 1–8 produce a commit each except Task 0 and Task 9), ~200–400 inserted lines in `engine/src/techniques.rs`, minor deletions for the two deleted "still stuck" tests.

- [ ] **Step 2: Ask the user for explicit push approval**

Per memory `confirm-before-main-push`, use `AskUserQuestion` to ask whether to:

- **Fast-forward merge to main + push** (deploys; engine binaries rebuild on Render; *visible* behavior change for players: nightmare-tier puzzles in the generator pool may shift because the generator now grades formerly-stuck candidates as T5Nightmare; Inkala-class puzzles can now be graded, which is the headline change).
- **Open a PR for review first.**
- **Hold local.**

DO NOT push without an explicit affirmative answer.

- [ ] **Step 3: If approved — fast-forward merge and push**

Run:
```bash
cd /Users/robertmccrady/stillgrid
git checkout main
git merge --ff-only t5-forcing-chains
git push origin main
```
Expected: clean fast-forward; push lands; Render auto-deploy fires within ~2 min.

- [ ] **Step 4: Verify the deploy**

Run:
```bash
EXPECTED=$(git rev-parse --short HEAD)
echo "Waiting for Render to deploy $EXPECTED..."
for i in $(seq 1 30); do
  LIVE=$(/usr/bin/curl -s https://stillgrid.app/healthz | /usr/bin/grep -o '"commit":"[a-f0-9]*"' | /usr/bin/cut -d'"' -f4)
  if [ "$LIVE" = "$EXPECTED" ]; then
    echo "DEPLOYED: production now on $LIVE"
    break
  fi
  /bin/sleep 10
done
```
Expected: production reports the new commit hash within ~3 min.

- [ ] **Step 5: Smoke-grade Inkala on production**

Run:
```bash
curl -s -X POST https://stillgrid.app/api/grade \
  -H 'Content-Type: application/json' \
  -d '{"givens":"8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4.."}' \
  | jq .
```
Expected: `{"outcome":"solved","tier":5,"tier_label":"nightmare",...}`. If still `stuck`, the deploy hasn't rolled forward — re-check `/healthz`.

- [ ] **Step 6: Delete the merged branch**

Run:
```bash
git branch -d t5-forcing-chains
```
Expected: `Deleted branch t5-forcing-chains (was <sha>).`

---

## Definition of Done for Commit 2

- [ ] `engine/src/techniques.rs` contains `Technique::ForcingChain`, `find_aic`, `find_bivalue_forcing`, `find_forcing_chain`, and `try_step` calls it as the T5 fallback after `find_simple_coloring`.
- [ ] At least 6 new tests in `mod tests` covering: tier mapping, AIC smoke, AIC behavioral (cross-digit fixture), bivalue forcing smoke, bivalue forcing behavioral, `find_forcing_chain` smoke, easy-stays-T1 regression, **Inkala solved at T5Nightmare** (the load-bearing one), and one additional hard puzzle (active or `#[ignore]`).
- [ ] Two stale tests deleted: `inkala_still_stuck`, `inkala_still_stuck_after_coloring`.
- [ ] `cargo test --release` green on every commit on the branch (Task 6's commit is the only one allowed to be amber: it may leave the two Inkala-stuck tests failing transiently, but Task 7's commit deletes them and adds the acceptance test in the same logical unit).
- [ ] `cargo clippy --release -- -D warnings` clean.
- [ ] Inkala grades as `Solved { tier: T5Nightmare, .. }` (locally and in prod after push).
- [ ] Performance: Inkala under 500ms wall-clock on the grader CLI (local hardware).
- [ ] No regressions: easy, swordfish, X-Sudoku, jigsaw, killer-cage-uniqueness, XY-Wing, all coloring tests still pass at their existing tiers.
- [ ] If merged to main: production `/healthz` reports the new commit; production `/api/grade` returns `tier: 5` for the Inkala givens.

---

## What's NOT in this commit (intentional)

- **ALS (Almost Locked Sets)** — commit 3, gated on the post-commit-2 stuck-rate measurement. If forcing chains close the practical gap, ALS is deferred.
- **Forced placements from contradiction detection.** When one bivalue branch contradicts itself, the cell's value is fully determined (the other branch). This is a powerful inference we intentionally skip in commit 2 — naked-single will catch the placement on the next iteration anyway.
- **Iterative deepening.** Our AIC DFS is bounded-depth (cap 12) but not strictly iteratively deepened. Shorter chains aren't preferred to longer ones; correctness is unaffected. If chain-explanation aesthetics ever matter (currently no UI surfaces them), revisit.
- **Per-variant tuning.** AIC and bivalue forcing run on the existing variant-aware `ChainGraph`. All four variants benefit. No special-casing.
- **Frontend/server changes.** The `Tier::T5Nightmare` slot, `"nightmare"` label, and per-tier weight already exist downstream — no UI work.
- **A second behavioral test for `find_aic` on a same-digit chain.** The cross-digit fixture covers the AIC machinery; a same-digit fixture would largely duplicate simple coloring's coverage. If a coverage gap shows up in production, add it then.

---

## Open Questions Worth Revisiting

- After commit 2 ships, run the spec's empirical measurement (1000 puzzles per variant). If any variant shows >0% stuck on T5 candidates, commit 3 (ALS) is on the table. Otherwise, document the residual and treat T5 as feature-complete.
- If the depth-12 cap proves insufficient — only Inkala or only some variants — surface this in the commit message and consider promoting `AIC_MAX_EDGES` / `FORCING_MAX_DEPTH` to a runtime tunable rather than a constant.
- Forced-placement inference (from branch contradiction) is left as future work; if profiling shows naked-single misses placements that forcing should catch, add the contradiction path then.
