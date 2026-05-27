# T5 Chain Techniques — Commit 1: ChainGraph + Simple Coloring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shared `ChainGraph` data structure to `engine/src/techniques.rs` and implement simple coloring as the first T5 technique. Establish the foundation that commits 2 (forcing chains) and 3 (ALS) will build on — without yet attempting to grade Inkala.

**Architecture:** Lazy-built per-grade `ChainGraph` encodes strong/weak links between `(cell, digit)` nodes. Simple coloring queries it for 2-coloring conflicts on per-digit strong-link subgraphs. New `Technique::Coloring` slots into `try_step` after `find_xywing`. All variant-aware (rows, cols, boxes, diagonals, cages) via the existing `Unit` list.

**Tech Stack:** Rust 2021. Existing test framework (`#[cfg(test)] mod tests` block at bottom of `techniques.rs`). No new dependencies.

**Branch:** `t5-coloring` (off `main`)

**Source spec:** [docs/superpowers/specs/2026-05-27-t5-chain-techniques-design.md](docs/superpowers/specs/2026-05-27-t5-chain-techniques-design.md)

---

## File Structure

This commit modifies exactly one file:

- **Modify:** `engine/src/techniques.rs` — add `Technique::Coloring` enum variant, `Node` + `ChainGraph` types and builder, `find_simple_coloring` function, wire into `try_step`, add new `#[test]` cases at the bottom of the existing `mod tests` block.

No new files. No changes to `board.rs`, `variant.rs`, `solver.rs`, `generator.rs`, the server, or the web — by spec, the `Tier::T5Nightmare` slot and `tier_label: "nightmare"` infrastructure already exist downstream.

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

- [ ] **Step 3: Create and switch to the branch**

Run:
```bash
git checkout -b t5-coloring
```
Expected: `Switched to a new branch 't5-coloring'`.

---

## Task 1: Add `Technique::Coloring` variant + tier mapping

**Files:**
- Modify: `engine/src/techniques.rs:11-38` (enum), `:49-62` (`impl Technique`), `:909-1134` (tests block)

- [ ] **Step 1: Write the failing test**

Append to the `mod tests` block at the bottom of `engine/src/techniques.rs` (after the existing `xywing_eliminates` test, before the final `}` of `mod tests`):

```rust
    #[test]
    fn coloring_tier_is_t5() {
        assert_eq!(Technique::Coloring.tier(), Tier::T5Nightmare);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd engine && cargo test --release coloring_tier_is_t5 2>&1 | tail -10
```
Expected: compile error — `no variant or associated item named 'Coloring' found for enum 'Technique'`. The test won't even compile.

- [ ] **Step 3: Add the enum variant**

In `engine/src/techniques.rs`, locate the `pub enum Technique` block (starts at line 11). Add a new section after `XYWing,` and before the closing `}`:

```rust
    // Tier 5 — chain-based
    Coloring,
```

The full enum tail should now end:
```rust
    SwordfishRow,
    SwordfishCol,
    XYWing,
    // Tier 5 — chain-based
    Coloring,
}
```

- [ ] **Step 4: Add the tier mapping**

In `engine/src/techniques.rs`, locate `impl Technique { pub fn tier(self) -> Tier {` (starts at line 49). Add a new match arm before the closing brace of the `match self` block:

```rust
            Coloring => Tier::T5Nightmare,
```

The full match block should now end:
```rust
            SwordfishRow | SwordfishCol | XYWing => Tier::T4Diabolical,
            Coloring => Tier::T5Nightmare,
        }
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
cd engine && cargo test --release coloring_tier_is_t5 2>&1 | tail -10
```
Expected: `test tests::coloring_tier_is_t5 ... ok` and `test result: ok. 1 passed`.

- [ ] **Step 6: Run full test suite to verify no regression**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -15
```
Expected: all existing tests still pass; one new test passes; no failures.

- [ ] **Step 7: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add Technique::Coloring enum variant mapped to T5Nightmare"
```

---

## Task 2: Define `Node` and `ChainGraph` types

**Files:**
- Modify: `engine/src/techniques.rs` — append type definitions after the `Candidates` impl block (after line 221), before the `popcount` helper at line 224.

- [ ] **Step 1: Write the failing test**

Append to the `mod tests` block:

```rust
    #[test]
    fn chain_graph_empty_when_no_candidates() {
        let peers = PeerTable::build(&Variant::classic());
        let c = Candidates { masks: [0u16; CELLS] };
        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        assert_eq!(g.nodes.len(), 0, "no candidates -> no nodes");
        // Spot-check a few cells: node_of entries should all be NONE_NODE.
        for d in 0..N {
            assert_eq!(g.node_of[cell_index(0, 0)][d], NONE_NODE);
        }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd engine && cargo test --release chain_graph_empty_when_no_candidates 2>&1 | tail -10
```
Expected: compile error — `cannot find function 'build_chain_graph'`, `cannot find type 'NONE_NODE'`, etc.

- [ ] **Step 3: Add type definitions and stub builder**

In `engine/src/techniques.rs`, after the `Candidates` impl block (after `}` at line 221) and before `#[inline] fn popcount` (line 224), insert:

```rust
// --- chain graph ----------------------------------------------------------
//
// Shared inference structure used by T5+ techniques. Nodes are individual
// (cell, digit) candidates; edges encode strong and weak links derived from
// bivalue cells, bilocal units, and unit peer relationships. Built lazily
// once per try_step invocation, only when T1–T4 techniques have failed.

const NONE_NODE: u16 = u16::MAX;

#[derive(Clone, Copy, Debug)]
struct Node {
    cell: u16,
    digit: u8,
}

struct ChainGraph {
    /// node_of[cell_index][digit-1] -> node id, or NONE_NODE if no candidate.
    node_of: [[u16; N]; CELLS],
    /// One node per (cell, digit) candidate present in Candidates at build time.
    nodes: Vec<Node>,
    /// strong[n] = nodes that are TRUE iff n is FALSE (bivalue cell, bilocal unit).
    /// Symmetric: if a is in strong[b], b is in strong[a].
    strong: Vec<Vec<u16>>,
    /// weak[n] = nodes that must be FALSE if n is TRUE (cell + unit peers).
    /// Symmetric: if a is in weak[b], b is in weak[a].
    weak: Vec<Vec<u16>>,
}

fn build_chain_graph(c: &Candidates, _peers: &PeerTable, _units: &[Unit]) -> ChainGraph {
    let mut g = ChainGraph {
        node_of: [[NONE_NODE; N]; CELLS],
        nodes: Vec::new(),
        strong: Vec::new(),
        weak: Vec::new(),
    };
    // Pass 1: enumerate nodes from every candidate in c.
    for i in 0..CELLS {
        let m = c.masks[i];
        if m == 0 {
            continue;
        }
        for d in 1u8..=9 {
            if m & bit(d) != 0 {
                let n = g.nodes.len() as u16;
                g.nodes.push(Node { cell: i as u16, digit: d });
                g.node_of[i][(d - 1) as usize] = n;
            }
        }
    }
    g.strong.resize(g.nodes.len(), Vec::new());
    g.weak.resize(g.nodes.len(), Vec::new());
    g
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd engine && cargo test --release chain_graph_empty_when_no_candidates 2>&1 | tail -10
```
Expected: `test tests::chain_graph_empty_when_no_candidates ... ok`.

- [ ] **Step 5: Add a second test for node enumeration**

Append to `mod tests`:

```rust
    #[test]
    fn chain_graph_indexes_present_candidates() {
        let peers = PeerTable::build(&Variant::classic());
        let mut c = Candidates { masks: [0u16; CELLS] };
        c.masks[cell_index(0, 0)] = bit(1) | bit(2);
        c.masks[cell_index(0, 1)] = bit(3);
        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        assert_eq!(g.nodes.len(), 3);
        // node_of populated for the present candidates.
        assert_ne!(g.node_of[cell_index(0, 0)][0], NONE_NODE); // digit 1
        assert_ne!(g.node_of[cell_index(0, 0)][1], NONE_NODE); // digit 2
        assert_ne!(g.node_of[cell_index(0, 1)][2], NONE_NODE); // digit 3
        // Absent candidate stays NONE_NODE.
        assert_eq!(g.node_of[cell_index(0, 0)][2], NONE_NODE); // digit 3 not in (0,0)
        // strong/weak vectors are sized to match nodes.
        assert_eq!(g.strong.len(), g.nodes.len());
        assert_eq!(g.weak.len(), g.nodes.len());
    }
```

- [ ] **Step 6: Run the new test**

Run:
```bash
cd engine && cargo test --release chain_graph_indexes_present_candidates 2>&1 | tail -10
```
Expected: PASS.

- [ ] **Step 7: Run full suite, confirm clippy clean**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -10 && cargo clippy --release -- -D warnings 2>&1 | tail -5
```
Expected: all tests pass, clippy reports no warnings.

- [ ] **Step 8: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add Node + ChainGraph types with node enumeration"
```

---

## Task 3: Bivalue + bilocal strong link extraction

**Files:**
- Modify: `engine/src/techniques.rs` — expand `build_chain_graph` body.

- [ ] **Step 1: Write the failing test for bivalue strong link**

Append to `mod tests`:

```rust
    #[test]
    fn chain_graph_bivalue_cell_makes_strong_link() {
        let peers = PeerTable::build(&Variant::classic());
        let mut c = Candidates { masks: [0u16; CELLS] };
        // Bivalue cell at (0,0) with candidates {1, 2}.
        c.masks[cell_index(0, 0)] = bit(1) | bit(2);
        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        let n1 = g.node_of[cell_index(0, 0)][0] as usize; // digit 1
        let n2 = g.node_of[cell_index(0, 0)][1] as usize; // digit 2
        assert!(g.strong[n1].contains(&(n2 as u16)), "n1 -> n2 strong missing");
        assert!(g.strong[n2].contains(&(n1 as u16)), "n2 -> n1 strong missing");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd engine && cargo test --release chain_graph_bivalue_cell_makes_strong_link 2>&1 | tail -10
```
Expected: assertion failure — `n1 -> n2 strong missing` (graph builder doesn't add strong links yet).

- [ ] **Step 3: Write the failing test for bilocal unit strong link**

Append to `mod tests`:

```rust
    #[test]
    fn chain_graph_bilocal_unit_makes_strong_link() {
        let peers = PeerTable::build(&Variant::classic());
        let mut c = Candidates { masks: [0u16; CELLS] };
        // Row 0: only (0,0) and (0,3) have digit 5 as a candidate.
        // Need to populate the row with non-5 elsewhere so the bilocal logic
        // finds exactly two cells with candidate 5.
        for col in 0..N {
            let i = cell_index(0, col);
            if col == 0 || col == 3 {
                c.masks[i] = bit(5) | bit(6); // include extra so they're not naked singles
            } else {
                c.masks[i] = bit(6); // single, no 5
            }
        }
        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        let n_a = g.node_of[cell_index(0, 0)][5 - 1] as usize;
        let n_b = g.node_of[cell_index(0, 3)][5 - 1] as usize;
        assert!(g.strong[n_a].contains(&(n_b as u16)), "bilocal a -> b strong missing");
        assert!(g.strong[n_b].contains(&(n_a as u16)), "bilocal b -> a strong missing");
    }
```

- [ ] **Step 4: Run both tests to verify they fail**

Run:
```bash
cd engine && cargo test --release chain_graph 2>&1 | tail -20
```
Expected: both new bivalue + bilocal tests fail. The earlier `chain_graph_empty_when_no_candidates` and `chain_graph_indexes_present_candidates` still pass.

- [ ] **Step 5: Implement strong link extraction**

In `engine/src/techniques.rs`, locate the `build_chain_graph` function. Replace the entire function body with:

```rust
fn build_chain_graph(c: &Candidates, _peers: &PeerTable, units: &[Unit]) -> ChainGraph {
    let mut g = ChainGraph {
        node_of: [[NONE_NODE; N]; CELLS],
        nodes: Vec::new(),
        strong: Vec::new(),
        weak: Vec::new(),
    };
    // Pass 1: enumerate nodes from every candidate.
    for i in 0..CELLS {
        let m = c.masks[i];
        if m == 0 {
            continue;
        }
        for d in 1u8..=9 {
            if m & bit(d) != 0 {
                let n = g.nodes.len() as u16;
                g.nodes.push(Node { cell: i as u16, digit: d });
                g.node_of[i][(d - 1) as usize] = n;
            }
        }
    }
    g.strong.resize(g.nodes.len(), Vec::new());
    g.weak.resize(g.nodes.len(), Vec::new());

    // Pass 2: bivalue cells. A cell with exactly two candidates {a, b}:
    // the two corresponding nodes are strongly linked (one must be true).
    for i in 0..CELLS {
        let m = c.masks[i];
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
        let na = g.node_of[i][(a - 1) as usize];
        let nb = g.node_of[i][(b - 1) as usize];
        g.strong[na as usize].push(nb);
        g.strong[nb as usize].push(na);
    }

    // Pass 3: bilocal units. For each unit and each digit d, if exactly two
    // cells in the unit have d as a candidate, those two nodes are strongly
    // linked (one must be d).
    for u in units {
        for d in 1u8..=9 {
            let b = bit(d);
            let mut first: Option<u16> = None;
            let mut second: Option<u16> = None;
            let mut count = 0u32;
            for &(r, col) in &u.cells {
                let i = r * N + col;
                if c.masks[i] & b != 0 {
                    count += 1;
                    let nid = g.node_of[i][(d - 1) as usize];
                    if first.is_none() { first = Some(nid); }
                    else if second.is_none() { second = Some(nid); }
                    if count > 2 { break; }
                }
            }
            if count == 2 {
                let na = first.unwrap();
                let nb = second.unwrap();
                // Avoid double-adding when the same pair is bilocal across
                // multiple units (e.g. row + box). Check before push.
                if !g.strong[na as usize].contains(&nb) {
                    g.strong[na as usize].push(nb);
                    g.strong[nb as usize].push(na);
                }
            }
        }
    }
    g
}
```

- [ ] **Step 6: Run the strong-link tests**

Run:
```bash
cd engine && cargo test --release chain_graph 2>&1 | tail -15
```
Expected: all four `chain_graph_*` tests pass.

- [ ] **Step 7: Run full suite + clippy**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -8 && cargo clippy --release -- -D warnings 2>&1 | tail -5
```
Expected: all tests pass, clippy clean.

- [ ] **Step 8: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add bivalue + bilocal strong link extraction to ChainGraph"
```

---

## Task 4: Weak link extraction

**Files:**
- Modify: `engine/src/techniques.rs` — extend `build_chain_graph` with a pass for weak links.

- [ ] **Step 1: Write the failing test**

Append to `mod tests`:

```rust
    #[test]
    fn chain_graph_weak_links_cover_cell_and_unit_peers() {
        let peers = PeerTable::build(&Variant::classic());
        let mut c = Candidates { masks: [0u16; CELLS] };
        // Cell (0,0) has candidates {1, 2, 3} — three intra-cell weak links.
        c.masks[cell_index(0, 0)] = bit(1) | bit(2) | bit(3);
        // Cell (0,5) has candidate {1} — row peer of (0,0) for digit 1.
        c.masks[cell_index(0, 5)] = bit(1);
        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        let n_00_1 = g.node_of[cell_index(0, 0)][0] as usize;
        let n_00_2 = g.node_of[cell_index(0, 0)][1] as usize;
        let n_00_3 = g.node_of[cell_index(0, 0)][2] as usize;
        let n_05_1 = g.node_of[cell_index(0, 5)][0] as usize;
        // Intra-cell weak links: (0,0):1 <-> (0,0):2 and (0,0):1 <-> (0,0):3.
        assert!(g.weak[n_00_1].contains(&(n_00_2 as u16)), "intra-cell 1<->2 missing");
        assert!(g.weak[n_00_1].contains(&(n_00_3 as u16)), "intra-cell 1<->3 missing");
        // Unit-peer weak link: (0,0):1 <-> (0,5):1 (same row, same digit).
        assert!(g.weak[n_00_1].contains(&(n_05_1 as u16)), "row peer 1<->1 missing");
        assert!(g.weak[n_05_1].contains(&(n_00_1 as u16)), "row peer reverse missing");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd engine && cargo test --release chain_graph_weak 2>&1 | tail -10
```
Expected: assertion failure — `intra-cell 1<->2 missing` (no weak links extracted yet).

- [ ] **Step 3: Implement weak link extraction**

In `engine/src/techniques.rs`, in `build_chain_graph`, insert a fourth pass after the existing Pass 3 (bilocal units) but before the final `g` return:

```rust
    // Pass 4: weak links. (a) Two candidates in the same cell exclude each
    // other (only one can be the eventual value). (b) Two cells in the same
    // unit holding the same candidate cannot both be that value.
    // We dedup with a per-source set to keep edge lists clean.
    use std::collections::HashSet;
    let mut seen: Vec<HashSet<u16>> = vec![HashSet::new(); g.nodes.len()];

    // (a) Intra-cell weak links.
    for i in 0..CELLS {
        let m = c.masks[i];
        if popcount(m) < 2 {
            continue;
        }
        let mut digits: Vec<u8> = Vec::with_capacity(9);
        for d in 1u8..=9 {
            if m & bit(d) != 0 {
                digits.push(d);
            }
        }
        for a in 0..digits.len() {
            for b in (a + 1)..digits.len() {
                let na = g.node_of[i][(digits[a] - 1) as usize];
                let nb = g.node_of[i][(digits[b] - 1) as usize];
                if seen[na as usize].insert(nb) {
                    g.weak[na as usize].push(nb);
                }
                if seen[nb as usize].insert(na) {
                    g.weak[nb as usize].push(na);
                }
            }
        }
    }

    // (b) Same-unit, same-digit weak links.
    for u in units {
        for d in 1u8..=9 {
            let b = bit(d);
            let mut bearers: Vec<u16> = Vec::with_capacity(u.cells.len());
            for &(r, col) in &u.cells {
                let i = r * N + col;
                if c.masks[i] & b != 0 {
                    bearers.push(g.node_of[i][(d - 1) as usize]);
                }
            }
            for i_a in 0..bearers.len() {
                for i_b in (i_a + 1)..bearers.len() {
                    let na = bearers[i_a];
                    let nb = bearers[i_b];
                    if seen[na as usize].insert(nb) {
                        g.weak[na as usize].push(nb);
                    }
                    if seen[nb as usize].insert(na) {
                        g.weak[nb as usize].push(na);
                    }
                }
            }
        }
    }
```

- [ ] **Step 4: Run the weak-link test**

Run:
```bash
cd engine && cargo test --release chain_graph 2>&1 | tail -15
```
Expected: all five `chain_graph_*` tests pass.

- [ ] **Step 5: Run full suite + clippy**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -8 && cargo clippy --release -- -D warnings 2>&1 | tail -5
```
Expected: all tests pass, clippy clean. If clippy complains about the `use std::collections::HashSet` being inside a function, lift it to the top of the file.

- [ ] **Step 6: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add weak link extraction (intra-cell + same-unit) to ChainGraph"
```

---

## Task 5: Implement `find_simple_coloring` with color-trap fixture

**Files:**
- Modify: `engine/src/techniques.rs` — add `find_simple_coloring` function (place near `find_xywing`, before `try_step`).

- [ ] **Step 1: Write the failing smoke test**

This task adds the function. Its smoke test just verifies the function exists, accepts a `ChainGraph`, and returns either `None` or a valid `Step::Elimination`. Behavioral correctness (does it actually eliminate the right candidates?) is verified by Task 6's fixture.

Append to `mod tests`:

```rust
    #[test]
    fn simple_coloring_compiles_and_runs() {
        let peers = PeerTable::build(&Variant::classic());
        let mut c = Candidates { masks: [0u16; CELLS] };
        c.masks[cell_index(0, 0)] = bit(5) | bit(9);
        c.masks[cell_index(0, 5)] = bit(5) | bit(9);
        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        let result = find_simple_coloring(&g);
        if let Some(Step::Elimination { technique, .. }) = result {
            assert_eq!(technique, Technique::Coloring);
        }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd engine && cargo test --release simple_coloring_trap 2>&1 | tail -10
```
Expected: compile error — `cannot find function 'find_simple_coloring'`.

- [ ] **Step 3: Implement `find_simple_coloring`**

In `engine/src/techniques.rs`, locate `// --- main loop ---` near line 838. Insert this function ABOVE that comment (so it's grouped with the other finders):

```rust
// --- Tier 5: simple coloring ---------------------------------------------
//
// For each digit independently, 2-color the strong-link subgraph (nodes are
// (cell, digit) for this digit). If any same-color pair shares a weak link,
// that color is provably wrong → eliminate every candidate of that color.
// (Color wrap: two same-color nodes in the same unit. Color trap: a "victim"
// candidate sees both colors of a chain — handled as a follow-up case below.)

fn find_simple_coloring(g: &ChainGraph) -> Option<Step> {
    // color[node] = 0 unvisited, 1 = color A, 2 = color B.
    let mut color: Vec<u8> = vec![0; g.nodes.len()];

    for d in 1u8..=9 {
        // Build the per-digit subgraph as we go: a node belongs to the
        // subgraph iff it carries digit `d`.
        // Reset coloring scratch for this digit.
        for c in color.iter_mut() { *c = 0; }

        for start in 0..g.nodes.len() {
            if g.nodes[start].digit != d { continue; }
            if color[start] != 0 { continue; }
            // BFS, alternating colors at each strong link to a same-digit node.
            let mut queue: Vec<usize> = vec![start];
            color[start] = 1;
            let mut group_a: Vec<usize> = vec![start];
            let mut group_b: Vec<usize> = Vec::new();
            while let Some(n) = queue.pop() {
                let next_color = if color[n] == 1 { 2 } else { 1 };
                for &m in &g.strong[n] {
                    let m = m as usize;
                    if g.nodes[m].digit != d { continue; }
                    if color[m] == 0 {
                        color[m] = next_color;
                        if next_color == 1 { group_a.push(m); } else { group_b.push(m); }
                        queue.push(m);
                    } else if color[m] == color[n] {
                        // Parity contradiction → graph is not 2-colorable on
                        // strong links alone. This component is degenerate;
                        // skip the technique for this digit.
                        return None;
                    }
                }
            }
            // Color wrap: two same-color nodes share a weak link (i.e. see
            // each other via a unit peer).
            for &a in &group_a {
                for &b in &group_a {
                    if a >= b { continue; }
                    if g.weak[a].contains(&(b as u16)) {
                        // All A-color candidates are eliminable.
                        let removed: Vec<(usize, usize, u8)> = group_a.iter().map(|&n| {
                            let cell = g.nodes[n].cell as usize;
                            (cell / N, cell % N, d)
                        }).collect();
                        if !removed.is_empty() {
                            return Some(Step::Elimination {
                                technique: Technique::Coloring,
                                removed,
                            });
                        }
                    }
                }
            }
            for &a in &group_b {
                for &b in &group_b {
                    if a >= b { continue; }
                    if g.weak[a].contains(&(b as u16)) {
                        let removed: Vec<(usize, usize, u8)> = group_b.iter().map(|&n| {
                            let cell = g.nodes[n].cell as usize;
                            (cell / N, cell % N, d)
                        }).collect();
                        if !removed.is_empty() {
                            return Some(Step::Elimination {
                                technique: Technique::Coloring,
                                removed,
                            });
                        }
                    }
                }
            }
            // Color trap: a candidate of digit `d` NOT in this component
            // that weakly sees both an A-colored node and a B-colored node.
            // Such a candidate cannot be `d`.
            let mut trap_removed: Vec<(usize, usize, u8)> = Vec::new();
            for victim in 0..g.nodes.len() {
                if g.nodes[victim].digit != d { continue; }
                if color[victim] != 0 { continue; } // only victims outside the chain
                let sees_a = group_a.iter().any(|&a| g.weak[victim].contains(&(a as u16)));
                let sees_b = group_b.iter().any(|&b| g.weak[victim].contains(&(b as u16)));
                if sees_a && sees_b {
                    let cell = g.nodes[victim].cell as usize;
                    trap_removed.push((cell / N, cell % N, d));
                }
            }
            if !trap_removed.is_empty() {
                return Some(Step::Elimination {
                    technique: Technique::Coloring,
                    removed: trap_removed,
                });
            }
        }
    }
    None
}
```

- [ ] **Step 4: Run the test**

Run:
```bash
cd engine && cargo test --release simple_coloring_trap 2>&1 | tail -10
```
Expected: PASS (the smoke test just verifies the function exists and doesn't panic).

- [ ] **Step 5: Run full suite + clippy**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -8 && cargo clippy --release -- -D warnings 2>&1 | tail -5
```
Expected: all tests pass, clippy clean. Clippy may flag `group_a.iter().any(...)` patterns — that's intentional and idiomatic, leave them.

- [ ] **Step 6: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add find_simple_coloring with color wrap + trap detection"
```

---

## Task 6: Behavioral test — color trap actually eliminates

**Files:**
- Modify: `engine/src/techniques.rs` — append behavioral test to `mod tests`.

- [ ] **Step 1: Write the behavioral test**

**Fixture design** (read this before writing the code so the assertion is grounded):

For digit 5, place candidates only at these 5 cells: `(0,0), (4,0), (4,4), (0,4)` are the chain; `(0,8)` is the victim. Every other cell has digit 5 removed.

- **Row 0 bearers of 5:** `(0,0), (0,4), (0,8)` — 3 cells → no row 0 strong link (count ≠ 2), but weak links among all three pairs.
- **Row 4 bearers of 5:** `(4,0), (4,4)` — 2 cells → bilocal strong link.
- **Col 0 bearers of 5:** `(0,0), (4,0)` — 2 cells → bilocal strong link.
- **Col 4 bearers of 5:** `(0,4), (4,4)` — 2 cells → bilocal strong link.
- **Col 8 bearers of 5:** `(0,8)` — 1 cell → no link.
- **Every box:** ≤1 bearer → no box strong links.

Strong-link chain on digit 5: `(0,0) — (4,0) — (4,4) — (0,4)`. Linear, 4 nodes. 2-coloring from `(0,0)=A`: `(4,0)=B`, `(4,4)=A`, `(0,4)=B`.

Victim `(0,8)` is **not** in any strong-link chain (color stays 0). It has weak links via row 0 to `(0,0)` (color A) and `(0,4)` (color B). The trap fires → eliminate digit 5 from `(0,8)`.

This design avoids the trap that breaks naive setups: a victim in box 0 would be pulled INTO the chain via box bilocal, instead of staying outside it.

Append to `mod tests`:

```rust
    /// Color trap: a victim candidate outside the chain sees both colors of a
    /// 2-coloring on digit `d` → that candidate is eliminated.
    ///
    /// Chain on digit 5: (0,0) — (4,0) — (4,4) — (0,4), 4 nodes, linear.
    /// 2-coloring: A = {(0,0), (4,4)}, B = {(4,0), (0,4)}.
    /// Victim (0,8) sees (0,0) [A] and (0,4) [B] via row 0 weak links.
    /// Expected: eliminate digit 5 from (0,8).
    #[test]
    fn simple_coloring_trap_actually_eliminates() {
        let peers = PeerTable::build(&Variant::classic());
        let mut c = Candidates { masks: [ALL; CELLS] };
        // Remove digit 5 everywhere, then re-add it only at the chain + victim cells.
        for i in 0..CELLS {
            c.masks[i] &= !bit(5);
        }
        let cells_with_5 = [(0, 0), (4, 0), (4, 4), (0, 4), (0, 8)];
        for &(r, col) in &cells_with_5 {
            c.masks[cell_index(r, col)] |= bit(5);
        }

        // Sanity: row 0 has 3 bearers (no row 0 strong link), col 0 has 2
        // (strong link), col 4 has 2 (strong link), row 4 has 2 (strong link).
        let row0_5 = (0..N).filter(|&col| c.masks[cell_index(0, col)] & bit(5) != 0).count();
        let col0_5 = (0..N).filter(|&r| c.masks[cell_index(r, 0)] & bit(5) != 0).count();
        let col4_5 = (0..N).filter(|&r| c.masks[cell_index(r, 4)] & bit(5) != 0).count();
        let row4_5 = (0..N).filter(|&col| c.masks[cell_index(4, col)] & bit(5) != 0).count();
        assert_eq!(row0_5, 3, "row 0 should have 5 at (0,0),(0,4),(0,8)");
        assert_eq!(col0_5, 2, "col 0 should have 5 at (0,0),(4,0)");
        assert_eq!(col4_5, 2, "col 4 should have 5 at (0,4),(4,4)");
        assert_eq!(row4_5, 2, "row 4 should have 5 at (4,0),(4,4)");

        let units = build_units(&Variant::classic());
        let g = build_chain_graph(&c, &peers, &units);
        let step = find_simple_coloring(&g).expect("color trap should fire on (0,8)");
        match step {
            Step::Elimination { technique, removed } => {
                assert_eq!(technique, Technique::Coloring);
                let hit_08 = removed.iter().any(|&(r, col, v)| (r, col, v) == (0, 8, 5));
                assert!(hit_08, "expected (0,8,5) eliminated, got {:?}", removed);
            }
            _ => panic!("expected elimination, got {:?}", step),
        }
    }
```

- [ ] **Step 2: Run the test**

Run:
```bash
cd engine && cargo test --release simple_coloring_trap_actually 2>&1 | tail -15
```
Expected: PASS. If FAIL, the chain structure or coloring logic needs adjustment — examine the actual `removed` Vec and the `g.strong` / `g.weak` contents for the chain cells.

- [ ] **Step 3: Run full suite + clippy**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -8 && cargo clippy --release -- -D warnings 2>&1 | tail -5
```
Expected: all tests pass, clippy clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Add behavioral test verifying coloring trap eliminates correctly"
```

---

## Task 7: Wire `find_simple_coloring` into `try_step` + regression sweep

**Files:**
- Modify: `engine/src/techniques.rs:840-849` — `try_step` orchestrator.

- [ ] **Step 1: Write the regression test**

Append to `mod tests`:

```rust
    /// After T5 lands, the easy puzzle must still grade as T1Easy —
    /// coloring must NOT fire when easier techniques apply.
    #[test]
    fn easy_does_not_promote_to_t5_with_coloring_available() {
        let b = Board::from_str(EASY).unwrap();
        match grade(&b) {
            GradeOutcome::Solved { tier, .. } => assert_eq!(tier, Tier::T1Easy),
            other => panic!("expected Solved at T1Easy, got {:?}", other),
        }
    }

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

- [ ] **Step 2: Run the regression tests (expect easy_does_not_promote to FAIL or PASS depending on wiring)**

Run:
```bash
cd engine && cargo test --release easy_does_not_promote 2>&1 | tail -10
cd engine && cargo test --release inkala_still_stuck_after 2>&1 | tail -10
```
Expected before wiring: `easy_does_not_promote_to_t5_with_coloring_available` passes (because `find_simple_coloring` isn't called yet). `inkala_still_stuck_after_coloring` passes (Inkala still Stuck). Both should pass before AND after wiring; this test ensures it.

- [ ] **Step 3: Wire `find_simple_coloring` into `try_step`**

In `engine/src/techniques.rs`, locate `fn try_step` (line 840). Replace its body, keeping the existing `.or_else` chain style — the graph build inside the closure is lazy, so it only runs when T1–T4 finders all returned None:

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
        })
}
```

- [ ] **Step 4: Re-run the regression tests**

Run:
```bash
cd engine && cargo test --release easy_does_not_promote 2>&1 | tail -10
cd engine && cargo test --release inkala_still_stuck_after 2>&1 | tail -10
```
Expected: both PASS. Easy still grades T1, Inkala still stuck (coloring doesn't crack it).

- [ ] **Step 5: Run the entire test suite**

Run:
```bash
cd engine && cargo test --release 2>&1 | tail -15
```
Expected: every existing test still passes (easy_still_easy, inkala_still_stuck, naked_single_step, xsudoku_diagonal_eliminates, jigsaw_custom_box_eliminates, killer_cage_uniqueness_eliminates, swordfish_row_eliminates, xywing_eliminates) plus all the new T5-coloring tests pass. Total: existing 8 + 8 new = 16 tests, all green.

- [ ] **Step 6: Clippy clean**

Run:
```bash
cd engine && cargo clippy --release -- -D warnings 2>&1 | tail -5
```
Expected: no warnings.

- [ ] **Step 7: Performance smoke check**

Run:
```bash
cd /Users/robertmccrady/stillgrid
cargo build --release --manifest-path engine/Cargo.toml 2>&1 | tail -3
time (echo "$(printf '8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..')" | engine/target/release/stillgrid-grade)
```
Expected: completes in <500ms. Output should be `{"outcome":"stuck",...}` (Inkala still stuck pre-commit-2). If it takes >2s, the lazy build in `try_step` may be firing per-iteration — check that the graph build isn't called from inside the solve loop more than once per stuck state.

- [ ] **Step 8: Commit**

```bash
cd /Users/robertmccrady/stillgrid
git add engine/src/techniques.rs
git commit -m "Wire find_simple_coloring into try_step (lazy graph build after T4)"
```

---

## Task 8: Merge to main (with user confirmation)

**Files:** (none)

- [ ] **Step 1: Show diff stat to the user**

Run:
```bash
cd /Users/robertmccrady/stillgrid
git --no-pager log --oneline main..t5-coloring
git --no-pager diff --stat main..t5-coloring
```
Expected: 7 commits (Tasks 1–7), ~600 inserted lines in `engine/src/techniques.rs`.

- [ ] **Step 2: Ask the user for explicit push approval**

Per memory `confirm-before-main-push`: ask the user (via AskUserQuestion) whether to:
- Fast-forward merge to main + push (deploys; engine binaries rebuild on Render; no behavior change visible to players because Inkala still grades Stuck — `nightmare`-tier puzzles in the generator pool may shift)
- Open a PR for review first
- Hold local

DO NOT push without an explicit affirmative answer.

- [ ] **Step 3: If approved — fast-forward merge and push**

Run:
```bash
cd /Users/robertmccrady/stillgrid
git checkout main
git merge --ff-only t5-coloring
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

- [ ] **Step 5: Delete the merged branch**

Run:
```bash
git branch -d t5-coloring
```
Expected: `Deleted branch t5-coloring (was <sha>).`

---

## Definition of Done for Commit 1

- [ ] `engine/src/techniques.rs` contains `Technique::Coloring`, `Node`, `ChainGraph`, `build_chain_graph`, `find_simple_coloring`, and `try_step` calls it as the T5 fallback.
- [ ] At least 8 new tests in `mod tests` covering: tier mapping, empty graph, node enumeration, bivalue strong, bilocal strong, weak links (intra-cell + unit peers), coloring smoke, coloring trap eliminates, easy-stays-easy regression, Inkala-still-stuck regression.
- [ ] `cargo test --release` green on every commit on the branch.
- [ ] `cargo clippy --release -- -D warnings` clean.
- [ ] Inkala still grades as `Stuck` (commit 1 is not the Inkala fixer — that's commit 2).
- [ ] No regressions: easy, swordfish, X-Sudoku, jigsaw, killer-cage-uniqueness, XY-Wing tests all still pass at their existing tiers.
- [ ] If merged to main: production `/healthz` reports the new commit.

---

## What's NOT in this commit (intentional)

- **Forcing chains** — commit 2 of the spec. The chain graph foundation lands here; the chains technique lands next.
- **ALS** — commit 3, conditional on commit 2 measurement.
- **Inkala grading.** Coloring alone doesn't crack Inkala; that's what chains are for.
- **Frontend/server changes.** Already wired (T5Nightmare tier exists, "nightmare" tier_label is typed). Player UI doesn't change.
- **Per-variant tuning.** All variants share the same coloring code via the existing `build_units` and `PeerTable`.
