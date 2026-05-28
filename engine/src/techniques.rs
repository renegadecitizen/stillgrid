//! Human-style technique solver — variant-aware.
//!
//! Tier 1 (singles), Tier 2 (naked/hidden pair, pointing pair), Tier 3 (X-Wing),
//! Tier 4 (Swordfish, XY-Wing), Tier 5 (simple coloring, forcing chains).
//! Variant support: classic, X-Sudoku (diagonals), Jigsaw (custom boxes),
//! Killer (cage uniqueness — cage-sum techniques are deferred).

use crate::board::{Board, CELLS, N};
use crate::variant::{cell_index, Variant};
use std::collections::HashSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Technique {
    // Tier 1 — placement
    NakedSingle,
    HiddenSingleRow,
    HiddenSingleCol,
    HiddenSingleBox,
    HiddenSingleDiag,
    HiddenSingleCage,
    // Tier 2 — candidate elimination
    NakedPairRow,
    NakedPairCol,
    NakedPairBox,
    NakedPairDiag,
    NakedPairCage,
    HiddenPairRow,
    HiddenPairCol,
    HiddenPairBox,
    HiddenPairDiag,
    HiddenPairCage,
    PointingPair,
    // Tier 3 — candidate elimination
    XWingRow,
    XWingCol,
    // Tier 4 — candidate elimination
    SwordfishRow,
    SwordfishCol,
    XYWing,
    // Tier 5 — chain-based
    Coloring,
    ForcingChain,
    Als,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Tier {
    T1Easy = 1,
    T2Medium = 2,
    T3Hard = 3,
    T4Diabolical = 4,
    T5Nightmare = 5,
}

impl Technique {
    pub fn tier(self) -> Tier {
        use Technique::*;
        match self {
            NakedSingle | HiddenSingleRow | HiddenSingleCol | HiddenSingleBox
            | HiddenSingleDiag | HiddenSingleCage => Tier::T1Easy,
            NakedPairRow | NakedPairCol | NakedPairBox | NakedPairDiag | NakedPairCage
            | HiddenPairRow | HiddenPairCol | HiddenPairBox | HiddenPairDiag | HiddenPairCage
            | PointingPair => Tier::T2Medium,
            XWingRow | XWingCol => Tier::T3Hard,
            SwordfishRow | SwordfishCol | XYWing => Tier::T4Diabolical,
            Coloring | ForcingChain | Als => Tier::T5Nightmare,
        }
    }
}

/// A solver step is either a placement (fills a cell) or an elimination
/// (removes one or more candidates without filling).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Step {
    Placement {
        technique: Technique,
        row: usize,
        col: usize,
        value: u8,
    },
    Elimination {
        technique: Technique,
        /// (row, col, value-removed) — at least one entry, often many.
        removed: Vec<(usize, usize, u8)>,
    },
}

impl Step {
    pub fn technique(&self) -> Technique {
        match self {
            Step::Placement { technique, .. } => *technique,
            Step::Elimination { technique, .. } => *technique,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GradeOutcome {
    Solved { solution: Board, steps: Vec<Step>, tier: Tier },
    Stuck { partial: Board, steps: Vec<Step> },
}

impl GradeOutcome {
    pub fn tier(&self) -> Option<Tier> {
        match self {
            GradeOutcome::Solved { tier, .. } => Some(*tier),
            GradeOutcome::Stuck { .. } => None,
        }
    }
}

// --- variant peer table ---------------------------------------------------
//
// For each cell, precompute the set of cells that share a unit with it
// (row + col + variant box + diagonals + cages). Used for candidate
// elimination on placement.

struct PeerTable {
    /// `peers[i]` = list of cell indices that share a unit with cell `i`.
    /// Excludes `i` itself; deduplicated.
    peers: Vec<Vec<usize>>,
}

impl PeerTable {
    fn build(variant: &Variant) -> Self {
        let mut peers: Vec<Vec<usize>> = vec![Vec::new(); CELLS];
        for i in 0..CELLS {
            let r = i / N;
            let c = i % N;
            let mut seen = [false; CELLS];
            seen[i] = true;
            let add = |i: usize, seen: &mut [bool; CELLS], peers: &mut Vec<usize>| {
                if !seen[i] {
                    seen[i] = true;
                    peers.push(i);
                }
            };
            // Row
            for cc in 0..N {
                add(cell_index(r, cc), &mut seen, &mut peers[i]);
            }
            // Col
            for rr in 0..N {
                add(cell_index(rr, c), &mut seen, &mut peers[i]);
            }
            // Box
            let b = variant.box_of[i] as usize;
            for &idx in &variant.boxes[b] {
                add(idx, &mut seen, &mut peers[i]);
            }
            // Diagonals
            if variant.diagonals {
                if r == c {
                    for k in 0..N {
                        add(cell_index(k, k), &mut seen, &mut peers[i]);
                    }
                }
                if r + c == N - 1 {
                    for k in 0..N {
                        add(cell_index(k, N - 1 - k), &mut seen, &mut peers[i]);
                    }
                }
            }
            // Cages
            for cage in &variant.cages {
                if cage.cells.contains(&i) {
                    for &idx in &cage.cells {
                        add(idx, &mut seen, &mut peers[i]);
                    }
                }
            }
        }
        PeerTable { peers }
    }
}

// --- candidate grid -------------------------------------------------------

#[derive(Clone)]
struct Candidates {
    masks: [u16; CELLS],
}

const ALL: u16 = 0b11_1111_1110; // bits 1..=9

impl Candidates {
    fn from_board(b: &Board, peers: &PeerTable) -> Self {
        let mut c = Candidates { masks: [ALL; CELLS] };
        for r in 0..N {
            for col in 0..N {
                let v = b.get(r, col);
                if v != 0 {
                    c.fill(r, col, v, peers);
                }
            }
        }
        c
    }

    #[inline]
    fn get(&self, r: usize, c: usize) -> u16 {
        self.masks[r * N + c]
    }

    #[inline]
    fn set(&mut self, r: usize, c: usize, m: u16) {
        self.masks[r * N + c] = m;
    }

    /// Mark (r,c) as filled with `v`; remove `v` from peers.
    fn fill(&mut self, r: usize, c: usize, v: u8, peers: &PeerTable) {
        let here = r * N + c;
        self.masks[here] = 0;
        let mask = !(1u16 << v);
        for &p in &peers.peers[here] {
            self.masks[p] &= mask;
        }
    }
}

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
        let mut digits = (1u8..=9).filter(|&d| m & bit(d) != 0);
        let a = digits.next().expect("popcount==2 implies first digit exists");
        let b = digits.next().expect("popcount==2 implies second digit exists");
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
                    if first.is_none() {
                        first = Some(nid);
                    } else if second.is_none() {
                        second = Some(nid);
                    }
                    if count > 2 {
                        break;
                    }
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

    // Pass 4: weak links. (a) Two candidates in the same cell exclude each
    // other (only one can be the eventual value). (b) Two cells in the same
    // unit holding the same candidate cannot both be that value.
    // We dedup with a per-source set to keep edge lists clean.
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

    g
}

#[inline]
fn popcount(m: u16) -> u32 {
    m.count_ones()
}

#[inline]
fn only_bit(m: u16) -> u8 {
    debug_assert_eq!(popcount(m), 1);
    m.trailing_zeros() as u8
}

#[inline]
fn bit(v: u8) -> u16 {
    1u16 << v
}

// --- unit iterators -------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum UnitKind {
    Row,
    Col,
    Box,
    Diag,
    Cage,
}

struct Unit {
    kind: UnitKind,
    cells: Vec<(usize, usize)>,
}

fn build_units(variant: &Variant) -> Vec<Unit> {
    let mut units = Vec::with_capacity(N * 3 + 2 + variant.cages.len());
    for r in 0..N {
        units.push(Unit { kind: UnitKind::Row, cells: (0..N).map(|c| (r, c)).collect() });
    }
    for c in 0..N {
        units.push(Unit { kind: UnitKind::Col, cells: (0..N).map(|r| (r, c)).collect() });
    }
    for b in 0..9 {
        units.push(Unit {
            kind: UnitKind::Box,
            cells: variant.boxes[b].iter().map(|&i| (i / N, i % N)).collect(),
        });
    }
    if variant.diagonals {
        units.push(Unit { kind: UnitKind::Diag, cells: (0..N).map(|i| (i, i)).collect() });
        units.push(Unit { kind: UnitKind::Diag, cells: (0..N).map(|i| (i, N - 1 - i)).collect() });
    }
    for cage in &variant.cages {
        units.push(Unit {
            kind: UnitKind::Cage,
            cells: cage.cells.iter().map(|&i| (i / N, i % N)).collect(),
        });
    }
    units
}

// --- Tier 1: singles ------------------------------------------------------

fn find_naked_single(c: &Candidates) -> Option<Step> {
    for r in 0..N {
        for col in 0..N {
            let m = c.get(r, col);
            if popcount(m) == 1 {
                return Some(Step::Placement {
                    technique: Technique::NakedSingle,
                    row: r,
                    col,
                    value: only_bit(m),
                });
            }
        }
    }
    None
}

fn hidden_single_tech(kind: UnitKind) -> Technique {
    match kind {
        UnitKind::Row => Technique::HiddenSingleRow,
        UnitKind::Col => Technique::HiddenSingleCol,
        UnitKind::Box => Technique::HiddenSingleBox,
        UnitKind::Diag => Technique::HiddenSingleDiag,
        UnitKind::Cage => Technique::HiddenSingleCage,
    }
}

fn naked_pair_tech(kind: UnitKind) -> Technique {
    match kind {
        UnitKind::Row => Technique::NakedPairRow,
        UnitKind::Col => Technique::NakedPairCol,
        UnitKind::Box => Technique::NakedPairBox,
        UnitKind::Diag => Technique::NakedPairDiag,
        UnitKind::Cage => Technique::NakedPairCage,
    }
}

fn hidden_pair_tech(kind: UnitKind) -> Technique {
    match kind {
        UnitKind::Row => Technique::HiddenPairRow,
        UnitKind::Col => Technique::HiddenPairCol,
        UnitKind::Box => Technique::HiddenPairBox,
        UnitKind::Diag => Technique::HiddenPairDiag,
        UnitKind::Cage => Technique::HiddenPairCage,
    }
}

fn find_hidden_single_unit(
    c: &Candidates,
    cells: &[(usize, usize)],
    tech: Technique,
) -> Option<Step> {
    for v in 1u8..=9 {
        let b = bit(v);
        let mut count = 0usize;
        let mut at = (0usize, 0usize);
        for &(r, col) in cells {
            if c.get(r, col) & b != 0 {
                count += 1;
                at = (r, col);
                if count > 1 {
                    break;
                }
            }
        }
        if count == 1 {
            return Some(Step::Placement { technique: tech, row: at.0, col: at.1, value: v });
        }
    }
    None
}

fn find_hidden_single(c: &Candidates, units: &[Unit]) -> Option<Step> {
    for u in units {
        if let Some(s) = find_hidden_single_unit(c, &u.cells, hidden_single_tech(u.kind)) {
            return Some(s);
        }
    }
    None
}

// --- Tier 2: naked pair ---------------------------------------------------

fn find_naked_pair_unit(c: &Candidates, cells: &[(usize, usize)], tech: Technique) -> Option<Step> {
    for i in 0..cells.len() {
        let (r1, c1) = cells[i];
        let m1 = c.get(r1, c1);
        if popcount(m1) != 2 {
            continue;
        }
        for j in (i + 1)..cells.len() {
            let (r2, c2) = cells[j];
            if c.get(r2, c2) != m1 {
                continue;
            }
            let mut removed = Vec::new();
            for &(r, col) in cells {
                if (r, col) == (r1, c1) || (r, col) == (r2, c2) {
                    continue;
                }
                let other = c.get(r, col);
                let overlap = other & m1;
                if overlap == 0 {
                    continue;
                }
                for v in 1u8..=9 {
                    if overlap & bit(v) != 0 {
                        removed.push((r, col, v));
                    }
                }
            }
            if !removed.is_empty() {
                return Some(Step::Elimination { technique: tech, removed });
            }
        }
    }
    None
}

fn find_naked_pair(c: &Candidates, units: &[Unit]) -> Option<Step> {
    for u in units {
        if let Some(s) = find_naked_pair_unit(c, &u.cells, naked_pair_tech(u.kind)) {
            return Some(s);
        }
    }
    None
}

// --- Tier 2: hidden pair --------------------------------------------------

fn find_hidden_pair_unit(
    c: &Candidates,
    cells: &[(usize, usize)],
    tech: Technique,
) -> Option<Step> {
    for v1 in 1u8..=8 {
        let b1 = bit(v1);
        let mut cells_v1 = Vec::new();
        for &(r, col) in cells {
            if c.get(r, col) & b1 != 0 {
                cells_v1.push((r, col));
            }
        }
        if cells_v1.len() != 2 {
            continue;
        }
        for v2 in (v1 + 1)..=9 {
            let b2 = bit(v2);
            let mut cells_v2 = Vec::new();
            for &(r, col) in cells {
                if c.get(r, col) & b2 != 0 {
                    cells_v2.push((r, col));
                }
            }
            if cells_v2 != cells_v1 {
                continue;
            }
            let pair_mask = b1 | b2;
            let mut removed = Vec::new();
            for &(r, col) in &cells_v1 {
                let m = c.get(r, col);
                let extra = m & !pair_mask;
                if extra == 0 {
                    continue;
                }
                for v in 1u8..=9 {
                    if extra & bit(v) != 0 {
                        removed.push((r, col, v));
                    }
                }
            }
            if !removed.is_empty() {
                return Some(Step::Elimination { technique: tech, removed });
            }
        }
    }
    None
}

fn find_hidden_pair(c: &Candidates, units: &[Unit]) -> Option<Step> {
    for u in units {
        if let Some(s) = find_hidden_pair_unit(c, &u.cells, hidden_pair_tech(u.kind)) {
            return Some(s);
        }
    }
    None
}

// --- Tier 2: pointing pair/triple ----------------------------------------
//
// If in some box, all candidates for a digit lie in a single row (or column),
// then that digit cannot appear in the rest of that row/column.
// Works for any box shape including jigsaw — uses variant.box_of to test
// box membership instead of 3×3 bounding rectangle.

fn find_pointing_pair(c: &Candidates, variant: &Variant) -> Option<Step> {
    for b in 0..9 {
        let cells: Vec<(usize, usize)> = variant.boxes[b].iter().map(|&i| (i / N, i % N)).collect();
        for v in 1u8..=9 {
            let mask = bit(v);
            let mut rows = [false; N];
            let mut cols = [false; N];
            let mut count = 0;
            for &(r, col) in &cells {
                if c.get(r, col) & mask != 0 {
                    rows[r] = true;
                    cols[col] = true;
                    count += 1;
                }
            }
            if count < 2 {
                continue;
            }
            let rows_used: Vec<usize> = (0..N).filter(|&r| rows[r]).collect();
            if rows_used.len() == 1 {
                let r = rows_used[0];
                let mut removed = Vec::new();
                for col in 0..N {
                    // Skip cells of this box (jigsaw-safe).
                    if variant.box_of[cell_index(r, col)] as usize == b {
                        continue;
                    }
                    if c.get(r, col) & mask != 0 {
                        removed.push((r, col, v));
                    }
                }
                if !removed.is_empty() {
                    return Some(Step::Elimination { technique: Technique::PointingPair, removed });
                }
            }
            let cols_used: Vec<usize> = (0..N).filter(|&c| cols[c]).collect();
            if cols_used.len() == 1 {
                let col = cols_used[0];
                let mut removed = Vec::new();
                for r in 0..N {
                    if variant.box_of[cell_index(r, col)] as usize == b {
                        continue;
                    }
                    if c.get(r, col) & mask != 0 {
                        removed.push((r, col, v));
                    }
                }
                if !removed.is_empty() {
                    return Some(Step::Elimination { technique: Technique::PointingPair, removed });
                }
            }
        }
    }
    None
}

// --- Tier 3: X-Wing -------------------------------------------------------

fn find_xwing(c: &Candidates) -> Option<Step> {
    for v in 1u8..=9 {
        let mask = bit(v);
        let row_cols: Vec<Vec<usize>> =
            (0..N).map(|r| (0..N).filter(|&col| c.get(r, col) & mask != 0).collect()).collect();
        for r1 in 0..N {
            if row_cols[r1].len() != 2 {
                continue;
            }
            let cols = row_cols[r1].clone();
            for (r2, r2_cols) in row_cols.iter().enumerate().skip(r1 + 1) {
                if *r2_cols != cols {
                    continue;
                }
                let mut removed = Vec::new();
                for &col in &cols {
                    for r in 0..N {
                        if r == r1 || r == r2 {
                            continue;
                        }
                        if c.get(r, col) & mask != 0 {
                            removed.push((r, col, v));
                        }
                    }
                }
                if !removed.is_empty() {
                    return Some(Step::Elimination { technique: Technique::XWingRow, removed });
                }
            }
        }
        let col_rows: Vec<Vec<usize>> =
            (0..N).map(|col| (0..N).filter(|&r| c.get(r, col) & mask != 0).collect()).collect();
        for c1 in 0..N {
            if col_rows[c1].len() != 2 {
                continue;
            }
            let rows = col_rows[c1].clone();
            for (c2, c2_rows) in col_rows.iter().enumerate().skip(c1 + 1) {
                if *c2_rows != rows {
                    continue;
                }
                let mut removed = Vec::new();
                for &r in &rows {
                    for col in 0..N {
                        if col == c1 || col == c2 {
                            continue;
                        }
                        if c.get(r, col) & mask != 0 {
                            removed.push((r, col, v));
                        }
                    }
                }
                if !removed.is_empty() {
                    return Some(Step::Elimination { technique: Technique::XWingCol, removed });
                }
            }
        }
    }
    None
}

// --- Tier 4: Swordfish ---------------------------------------------------
//
// Row-based Swordfish: for a digit v, find 3 rows whose candidate-columns for v
// all lie within the same set of 3 columns (each row uses 2 or 3 of them).
// v must be in those 3×3 intersections, so eliminate v from those columns
// in every other row. Symmetric for columns.

fn find_swordfish(c: &Candidates) -> Option<Step> {
    for v in 1u8..=9 {
        let mask = bit(v);

        // Row-based
        let row_cols: Vec<Vec<usize>> =
            (0..N).map(|r| (0..N).filter(|&col| c.get(r, col) & mask != 0).collect()).collect();
        let candidate_rows: Vec<usize> = (0..N)
            .filter(|&r| {
                let n = row_cols[r].len();
                n == 2 || n == 3
            })
            .collect();
        for i in 0..candidate_rows.len() {
            for j in (i + 1)..candidate_rows.len() {
                for k in (j + 1)..candidate_rows.len() {
                    let (r1, r2, r3) = (candidate_rows[i], candidate_rows[j], candidate_rows[k]);
                    let mut union: Vec<usize> = Vec::new();
                    for r in [r1, r2, r3] {
                        for &c in &row_cols[r] {
                            if !union.contains(&c) {
                                union.push(c);
                            }
                        }
                    }
                    if union.len() != 3 {
                        continue;
                    }
                    let mut removed = Vec::new();
                    for &col in &union {
                        for r in 0..N {
                            if r == r1 || r == r2 || r == r3 {
                                continue;
                            }
                            if c.get(r, col) & mask != 0 {
                                removed.push((r, col, v));
                            }
                        }
                    }
                    if !removed.is_empty() {
                        return Some(Step::Elimination {
                            technique: Technique::SwordfishRow,
                            removed,
                        });
                    }
                }
            }
        }

        // Column-based
        let col_rows: Vec<Vec<usize>> =
            (0..N).map(|col| (0..N).filter(|&r| c.get(r, col) & mask != 0).collect()).collect();
        let candidate_cols: Vec<usize> = (0..N)
            .filter(|&col| {
                let n = col_rows[col].len();
                n == 2 || n == 3
            })
            .collect();
        for i in 0..candidate_cols.len() {
            for j in (i + 1)..candidate_cols.len() {
                for k in (j + 1)..candidate_cols.len() {
                    let (c1, c2, c3) = (candidate_cols[i], candidate_cols[j], candidate_cols[k]);
                    let mut union: Vec<usize> = Vec::new();
                    for col in [c1, c2, c3] {
                        for &r in &col_rows[col] {
                            if !union.contains(&r) {
                                union.push(r);
                            }
                        }
                    }
                    if union.len() != 3 {
                        continue;
                    }
                    let mut removed = Vec::new();
                    for &r in &union {
                        for col in 0..N {
                            if col == c1 || col == c2 || col == c3 {
                                continue;
                            }
                            if c.get(r, col) & mask != 0 {
                                removed.push((r, col, v));
                            }
                        }
                    }
                    if !removed.is_empty() {
                        return Some(Step::Elimination {
                            technique: Technique::SwordfishCol,
                            removed,
                        });
                    }
                }
            }
        }
    }
    None
}

// --- Tier 4: XY-Wing -----------------------------------------------------
//
// Pivot is a cell with exactly two candidates {X, Y}. Two wing cells, each a
// peer of the pivot, have candidates {X, Z} and {Y, Z}. Then any cell that
// sees BOTH wings can have Z eliminated (because one of the wings must end
// up as Z regardless of which value the pivot takes).
//
// Variant-aware via PeerTable.

fn find_xywing(c: &Candidates, peers: &PeerTable) -> Option<Step> {
    // Collect bivalue cells (exactly 2 candidates).
    let bivalues: Vec<(usize, u16)> = (0..CELLS)
        .filter_map(|i| {
            let m = c.masks[i];
            if popcount(m) == 2 {
                Some((i, m))
            } else {
                None
            }
        })
        .collect();
    if bivalues.len() < 3 {
        return None;
    }

    for &(pivot, pivot_mask) in &bivalues {
        // Decompose pivot mask into (X, Y).
        let mut digits = [0u8; 2];
        let mut k = 0;
        for v in 1u8..=9 {
            if pivot_mask & bit(v) != 0 {
                digits[k] = v;
                k += 1;
            }
        }
        let (x, y) = (digits[0], digits[1]);

        // Wings must be peers of pivot AND bivalue.
        let pivot_peers = &peers.peers[pivot];
        for &(w1, w1_mask) in &bivalues {
            if w1 == pivot || !pivot_peers.contains(&w1) {
                continue;
            }
            // w1 must contain X and exactly one other digit Z != Y.
            let w1_has_x = w1_mask & bit(x) != 0;
            let w1_has_y = w1_mask & bit(y) != 0;
            if !(w1_has_x ^ w1_has_y) {
                continue;
            }
            // w1 holds {X, Z} or {Y, Z}. Identify Z.
            let shared_digit = if w1_has_x { x } else { y };
            let z_mask = w1_mask & !bit(shared_digit);
            if popcount(z_mask) != 1 {
                continue;
            }
            let z = only_bit(z_mask);
            if z == x || z == y {
                continue;
            }
            // The other shared digit between pivot and wing-2 must be the one
            // NOT shared with w1.
            let other = if w1_has_x { y } else { x };
            let want_mask = bit(other) | bit(z);
            for &(w2, w2_mask) in &bivalues {
                if w2 == pivot || w2 == w1 || !pivot_peers.contains(&w2) {
                    continue;
                }
                if w2_mask != want_mask {
                    continue;
                }
                // XY-Wing found. Eliminate Z from cells that see BOTH wings.
                let w1_peers = &peers.peers[w1];
                let w2_peers = &peers.peers[w2];
                let mut removed = Vec::new();
                for i in 0..CELLS {
                    if i == pivot || i == w1 || i == w2 {
                        continue;
                    }
                    if !w1_peers.contains(&i) || !w2_peers.contains(&i) {
                        continue;
                    }
                    if c.masks[i] & bit(z) != 0 {
                        removed.push((i / N, i % N, z));
                    }
                }
                if !removed.is_empty() {
                    return Some(Step::Elimination { technique: Technique::XYWing, removed });
                }
            }
        }
    }
    None
}

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
        for c in color.iter_mut() {
            *c = 0;
        }

        for start in 0..g.nodes.len() {
            if g.nodes[start].digit != d {
                continue;
            }
            if color[start] != 0 {
                continue;
            }
            // DFS via stack, alternating colors at each strong link to a same-digit node.
            // For 2-coloring on a bipartite graph, traversal order doesn't affect the
            // resulting color assignment — only the discovery order.
            let mut queue: Vec<usize> = vec![start];
            color[start] = 1;
            let mut group_a: Vec<usize> = vec![start];
            let mut group_b: Vec<usize> = Vec::new();
            while let Some(n) = queue.pop() {
                let next_color = if color[n] == 1 { 2 } else { 1 };
                for &m in &g.strong[n] {
                    let m = m as usize;
                    if g.nodes[m].digit != d {
                        continue;
                    }
                    if color[m] == 0 {
                        color[m] = next_color;
                        if next_color == 1 {
                            group_a.push(m);
                        } else {
                            group_b.push(m);
                        }
                        queue.push(m);
                    } else if color[m] == color[n] {
                        // Parity contradiction → the strong-link subgraph isn't 2-colorable.
                        // The candidate set is likely inconsistent at this point; bail out
                        // of coloring for ALL digits in this call. A later try_step iteration
                        // (after other techniques fire) may produce a clean graph next time.
                        return None;
                    }
                }
            }
            // Color wrap: two same-color nodes share a weak link (i.e. see
            // each other via a unit peer).
            for &a in &group_a {
                for &b in &group_a {
                    if a >= b {
                        continue;
                    }
                    if g.weak[a].contains(&(b as u16)) {
                        // All A-color candidates are eliminable.
                        let removed: Vec<(usize, usize, u8)> = group_a
                            .iter()
                            .map(|&n| {
                                let cell = g.nodes[n].cell as usize;
                                (cell / N, cell % N, d)
                            })
                            .collect();
                        return Some(Step::Elimination { technique: Technique::Coloring, removed });
                    }
                }
            }
            for &a in &group_b {
                for &b in &group_b {
                    if a >= b {
                        continue;
                    }
                    if g.weak[a].contains(&(b as u16)) {
                        let removed: Vec<(usize, usize, u8)> = group_b
                            .iter()
                            .map(|&n| {
                                let cell = g.nodes[n].cell as usize;
                                (cell / N, cell % N, d)
                            })
                            .collect();
                        return Some(Step::Elimination { technique: Technique::Coloring, removed });
                    }
                }
            }
            // Color trap: a candidate of digit `d` NOT in this component
            // that weakly sees both an A-colored node and a B-colored node.
            // Such a candidate cannot be `d`.
            let mut trap_removed: Vec<(usize, usize, u8)> = Vec::new();
            #[allow(clippy::needless_range_loop)]
            for victim in 0..g.nodes.len() {
                if g.nodes[victim].digit != d {
                    continue;
                }
                if color[victim] != 0 {
                    continue;
                } // only victims outside the chain
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
        for v in on_path.iter_mut() {
            *v = false;
        }
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
    // (Bitwise check instead of `% 2` to avoid clippy::manual_is_multiple_of,
    // which suggests `is_multiple_of` — a method stabilized in Rust 1.84.
    // Our Dockerfile pins rust:1.83-slim, so the modern API would break the
    // production build.)
    if depth >= 1 && (depth & 1) == 1 {
        if let Some(step) = aic_check_victims(g, start, last, on_path) {
            return Some(step);
        }
    }

    if depth >= AIC_MAX_EDGES {
        return None;
    }

    // Choose edge type: even depth -> next must be STRONG, odd -> WEAK.
    let next_is_strong = (depth & 1) == 0;
    let edges = if next_is_strong { &g.strong[last] } else { &g.weak[last] };
    for &next in edges {
        let next = next as usize;
        if on_path[next] {
            continue;
        }
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
fn aic_check_victims(g: &ChainGraph, start: usize, end: usize, on_path: &[bool]) -> Option<Step> {
    if start == end {
        return None;
    }
    let mut removed: Vec<(usize, usize, u8)> = Vec::new();
    for (victim, &is_on_path) in on_path.iter().enumerate().take(g.nodes.len()) {
        if is_on_path {
            continue;
        }
        let sees_start = g.weak[victim].contains(&(start as u16));
        if !sees_start {
            continue;
        }
        let sees_end = g.weak[victim].contains(&(end as u16));
        if !sees_end {
            continue;
        }
        let cell = g.nodes[victim].cell as usize;
        removed.push((cell / N, cell % N, g.nodes[victim].digit));
    }
    if removed.is_empty() {
        return None;
    }
    Some(Step::Elimination { technique: Technique::ForcingChain, removed })
}

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
                if a == 0 {
                    a = d;
                } else {
                    b = d;
                }
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
        for (n, (&fa, &fb)) in false_a.iter().zip(false_b.iter()).enumerate() {
            if fa && fb {
                let cell_n = g.nodes[n].cell as usize;
                removed.push((cell_n / N, cell_n % N, g.nodes[n].digit));
            }
        }
        if !removed.is_empty() {
            return Some(Step::Elimination { technique: Technique::ForcingChain, removed });
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
        if frontier.is_empty() {
            break;
        }
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

fn find_forcing_chain(g: &ChainGraph, c: &Candidates) -> Option<Step> {
    find_aic(g).or_else(|| find_bivalue_forcing(g, c))
}

// --- main loop ------------------------------------------------------------

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
            find_simple_coloring(&g).or_else(|| find_forcing_chain(&g, c))
        })
}

fn apply(step: &Step, board: &mut Board, cands: &mut Candidates, peers: &PeerTable) {
    match step {
        Step::Placement { row, col, value, .. } => {
            board.set(*row, *col, *value);
            cands.fill(*row, *col, *value, peers);
        }
        Step::Elimination { removed, .. } => {
            for &(r, c, v) in removed {
                let m = cands.get(r, c);
                cands.set(r, c, m & !bit(v));
            }
        }
    }
}

/// Classic-only grader — backward-compatible shim.
pub fn grade(board: &Board) -> GradeOutcome {
    grade_variant(board, &Variant::classic())
}

/// Variant-aware grader.
pub fn grade_variant(board: &Board, variant: &Variant) -> GradeOutcome {
    let peers = PeerTable::build(variant);
    let units = build_units(variant);
    let mut work = *board;
    let mut cands = Candidates::from_board(&work, &peers);
    let mut steps: Vec<Step> = Vec::new();
    let mut highest = Tier::T1Easy;

    loop {
        if work.is_complete() {
            return GradeOutcome::Solved { solution: work, steps, tier: highest };
        }
        match try_step(&cands, variant, &units, &peers) {
            Some(step) => {
                let t = step.technique().tier();
                if t > highest {
                    highest = t;
                }
                apply(&step, &mut work, &mut cands, &peers);
                steps.push(step);
            }
            None => {
                return GradeOutcome::Stuck { partial: work, steps };
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::variant::Cage;

    const EASY: &str =
        "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";

    /// Inkala's "World's Hardest Sudoku". Should still be Stuck after T1–T3.
    const INKALA: &str =
        "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..";

    #[test]
    fn easy_still_easy() {
        let b = Board::from_str(EASY).unwrap();
        match grade(&b) {
            GradeOutcome::Solved { tier, .. } => assert_eq!(tier, Tier::T1Easy),
            other => panic!("expected Solved, got {:?}", other),
        }
    }

    #[test]
    fn naked_single_step() {
        let mut b = Board::empty();
        for (col, v) in [1u8, 2, 3, 4, 6, 7, 8, 9].iter().enumerate() {
            let col_actual = if col >= 4 { col + 1 } else { col };
            b.set(0, col_actual, *v);
        }
        let peers = PeerTable::build(&Variant::classic());
        let c = Candidates::from_board(&b, &peers);
        let s = find_naked_single(&c).expect("should find naked single");
        match s {
            Step::Placement { row, col, value, .. } => assert_eq!((row, col, value), (0, 4, 5)),
            _ => panic!("expected placement"),
        }
    }

    /// X-Sudoku: a digit along the main diagonal must eliminate that digit
    /// from other diagonal cells, even when row/col/box don't.
    #[test]
    fn xsudoku_diagonal_eliminates() {
        let v = Variant::xsudoku();
        let peers = PeerTable::build(&v);
        let mut b = Board::empty();
        b.set(0, 0, 5);
        let c = Candidates::from_board(&b, &peers);
        // (4,4) is on the main diagonal — 5 should be eliminated.
        assert_eq!(c.get(4, 4) & bit(5), 0);
        // (4,5) is NOT on either diagonal — 5 should still be a candidate.
        assert_ne!(c.get(4, 5) & bit(5), 0);
    }

    /// Jigsaw: a cell's box is its variant box, not the 3×3.
    /// If box 0 contains cells (0,0) and (4,4) (non-classic), placing 5 at (0,0)
    /// should eliminate 5 from (4,4) via the box peer relation.
    #[test]
    fn jigsaw_custom_box_eliminates() {
        let mut partition = [0u8; CELLS];
        for r in 0..N {
            for c in 0..N {
                partition[cell_index(r, c)] = ((r / 3) * 3 + (c / 3)) as u8;
            }
        }
        // Swap one cell from box 4 (center) into box 0.
        // box 0 originally: (0..3, 0..3). box 4: (3..6, 3..6).
        // Move (4, 4) into box 0 and (0, 0) into box 4 to keep counts of 9.
        partition[cell_index(4, 4)] = 0;
        partition[cell_index(0, 0)] = 4;
        let v = Variant::jigsaw(partition);
        let peers = PeerTable::build(&v);
        let mut b = Board::empty();
        b.set(0, 1, 5); // in box 0 with (4,4)
        let c = Candidates::from_board(&b, &peers);
        // (4,4) is now in box 0 with (0,1), so 5 should be eliminated.
        assert_eq!(c.get(4, 4) & bit(5), 0);
    }

    /// Killer cages enforce uniqueness as a unit; placing a digit in one
    /// cage cell removes it from peers in the same cage.
    #[test]
    fn killer_cage_uniqueness_eliminates() {
        // One cage covering (0,0),(0,1),(0,2) plus 78 singleton cages over
        // the remaining cells. Sums don't matter for peer-table logic — we
        // only test that cage cells are peers.
        let mut cages = Vec::new();
        cages.push(Cage {
            cells: vec![cell_index(0, 0), cell_index(0, 1), cell_index(0, 2)],
            sum: 6,
        });
        for r in 0..N {
            for c in 0..N {
                if r == 0 && c < 3 {
                    continue;
                }
                cages.push(Cage { cells: vec![cell_index(r, c)], sum: 1 });
            }
        }
        let v = Variant::killer(cages);
        let peers = PeerTable::build(&v);
        // The cage cells are already row peers, so cage adds no new info
        // for this trivial layout. Build a cage that crosses rows to test
        // the cage-specific peer addition.
        let mut cages2 = Vec::new();
        cages2.push(Cage {
            cells: vec![cell_index(0, 0), cell_index(1, 1), cell_index(2, 2)],
            sum: 6,
        });
        for r in 0..N {
            for c in 0..N {
                if (r, c) == (0, 0) || (r, c) == (1, 1) || (r, c) == (2, 2) {
                    continue;
                }
                cages2.push(Cage { cells: vec![cell_index(r, c)], sum: 1 });
            }
        }
        let v2 = Variant::killer(cages2);
        let peers2 = PeerTable::build(&v2);
        let mut b = Board::empty();
        b.set(0, 0, 5);
        // Without the cage, (1,1) is a box peer of (0,0) so 5 would be eliminated
        // anyway. Pick (2,2) — different box, different row, different col.
        let c = Candidates::from_board(&b, &peers2);
        // (2,2) is in the same cage; 5 should be eliminated.
        assert_eq!(c.get(2, 2) & bit(5), 0);
        // Sanity: without cage involvement, classic peer table doesn't kill it.
        let peers_classic = PeerTable::build(&Variant::classic());
        let _c_classic = Candidates::from_board(&b, &peers_classic);
        // (2,2) IS in the same 3×3 box as (0,0) in classic, so this would be eliminated.
        // Use (3,3) instead for the classic sanity check — different row/col/box.
        let mut b2 = Board::empty();
        b2.set(0, 0, 5);
        let c_classic2 = Candidates::from_board(&b2, &peers_classic);
        assert_ne!(c_classic2.get(3, 3) & bit(5), 0);
        let _ = (c, peers); // silence
    }

    /// Swordfish row-based: 3 rows where digit 1 lives only in columns {0,3,6}
    /// (each row using 2 of the 3). Eliminates 1 from those columns in other rows.
    #[test]
    fn swordfish_row_eliminates() {
        // Start from ALL candidates, then prune digit 1 outside the target
        // pattern in rows 0, 4, 8.
        let peers = PeerTable::build(&Variant::classic());
        let mut c = Candidates { masks: [ALL; CELLS] };
        // Row 0: keep 1 only in cols 0,3
        for col in 0..N {
            if col != 0 && col != 3 {
                let i = cell_index(0, col);
                c.masks[i] &= !bit(1);
            }
        }
        // Row 4: keep 1 only in cols 0,6
        for col in 0..N {
            if col != 0 && col != 6 {
                let i = cell_index(4, col);
                c.masks[i] &= !bit(1);
            }
        }
        // Row 8: keep 1 only in cols 3,6
        for col in 0..N {
            if col != 3 && col != 6 {
                let i = cell_index(8, col);
                c.masks[i] &= !bit(1);
            }
        }
        // Some other row (row 2) has 1 in col 3 — should be eliminated.
        // Already true since row 2 cells still have full ALL mask.
        let step = find_swordfish(&c).expect("swordfish should fire");
        match step {
            Step::Elimination { technique, removed } => {
                assert_eq!(technique, Technique::SwordfishRow);
                // At least one removal should be (r, col, 1) with col in {0,3,6}
                // and r not in {0,4,8}.
                let valid = removed.iter().any(|&(r, col, v)| {
                    v == 1 && matches!(col, 0 | 3 | 6) && !matches!(r, 0 | 4 | 8)
                });
                assert!(valid, "expected swordfish elimination, got {:?}", removed);
            }
            _ => panic!("expected elimination"),
        }
        let _ = peers;
    }

    /// XY-Wing: pivot {1,2} at (0,0), wings {2,3} at (0,5) and {1,3} at (5,0).
    /// Cell (5,5) sees both wings — digit 3 should be eliminated there.
    #[test]
    fn xywing_eliminates() {
        let peers = PeerTable::build(&Variant::classic());
        let mut c = Candidates { masks: [ALL; CELLS] };
        // Force pivot (0,0) = {1,2}
        c.masks[cell_index(0, 0)] = bit(1) | bit(2);
        // Force wing 1 (0,5) = {2,3}
        c.masks[cell_index(0, 5)] = bit(2) | bit(3);
        // Force wing 2 (5,0) = {1,3}
        c.masks[cell_index(5, 0)] = bit(1) | bit(3);
        // (5,5) is a peer of both wings (same row as wing1, same col as wing2)
        // and still has 3 as a candidate (full ALL mask).
        let step = find_xywing(&c, &peers).expect("xy-wing should fire");
        match step {
            Step::Elimination { technique, removed } => {
                assert_eq!(technique, Technique::XYWing);
                let hit_55 = removed.iter().any(|&(r, col, v)| (r, col, v) == (5, 5, 3));
                assert!(hit_55, "expected 3 removed at (5,5), got {:?}", removed);
            }
            _ => panic!("expected elimination"),
        }
    }

    #[test]
    fn coloring_tier_is_t5() {
        assert_eq!(Technique::Coloring.tier(), Tier::T5Nightmare);
    }

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

    /// Inkala remains stuck after T5 commit 2 (forcing chains + simple coloring).
    /// Empirical diagnosis: Inkala's initial candidate state yields a ChainGraph
    /// with only ~9 strong-link edges across 254 nodes (1 bivalue cell, ~8 bilocal
    /// units). Forcing chains have almost nothing to walk. Depth bumps to 30
    /// don't help — the graph is structurally sparse by design of the puzzle.
    /// The Inkala fixer is deferred to T5 commit 3 (ALS), which the spec
    /// explicitly anticipates as a conditional follow-up when commit 2's
    /// stuck-rate is >0% — that condition holds here.
    #[test]
    fn inkala_stuck_pending_als() {
        let b = Board::from_str(INKALA).unwrap();
        assert!(
            matches!(grade(&b), GradeOutcome::Stuck { .. }),
            "Inkala should still be Stuck after T5 forcing chains; ALS lands in commit 3"
        );
    }

    /// "Easter Monster" — another widely-cited hard sudoku. Like Inkala 2012,
    /// its initial state is too sparse for forcing chains: forcing chains take
    /// 0 steps before stalling. Marked `#[ignore]` here so the test stays as a
    /// living marker — flip to a positive `assert_eq!(tier, T5Nightmare)` once
    /// commit 3 (ALS) lands and Easter Monster grades.
    const EASTER_MONSTER: &str =
        "1.......2.9.4...5...6...7...5.9.3.......7.......85..4.7.....6...3...9.8...2.....1";

    #[test]
    #[ignore = "stuck after T5 commit 2; enable post-ALS (commit 3)"]
    fn easter_monster_solves_at_t5_post_als() {
        let b = Board::from_str(EASTER_MONSTER).unwrap();
        match grade(&b) {
            GradeOutcome::Solved { tier, .. } => {
                assert_eq!(
                    tier,
                    Tier::T5Nightmare,
                    "Easter Monster should grade T5Nightmare, got {:?}",
                    tier
                );
            }
            other => panic!("Easter Monster should be Solved at T5Nightmare, got {:?}", other),
        }
    }

    #[test]
    fn forcing_chain_tier_is_t5() {
        assert_eq!(Technique::ForcingChain.tier(), Tier::T5Nightmare);
    }

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
        let step =
            find_bivalue_forcing(&g, &c).expect("bivalue forcing should fire on this fixture");
        match step {
            Step::Elimination { technique, removed } => {
                assert_eq!(technique, Technique::ForcingChain);
                let hit = removed.iter().any(|&(r, col, v)| (r, col, v) == (5, 4, 5));
                assert!(hit, "expected (5,4,5) eliminated, got {:?}", removed);
            }
            other => panic!("expected elimination, got {:?}", other),
        }
    }

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

    #[test]
    fn als_tier_is_t5() {
        assert_eq!(Technique::Als.tier(), Tier::T5Nightmare);
    }
}
