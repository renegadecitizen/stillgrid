//! Backtracking solver with uniqueness check, parameterized by Variant.

use crate::board::Board;
use crate::variant::Variant;

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
mod tests {
    use super::*;

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
}
