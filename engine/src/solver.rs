//! Backtracking solver with uniqueness check, parameterized by Variant.

use crate::board::{Board, N};
use crate::variant::Variant;

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

fn find_empty_min_options(
    board: &Board,
    variant: &Variant,
) -> Option<(usize, usize, Vec<u8>)> {
    let mut best: Option<(usize, usize, Vec<u8>)> = None;
    for r in 0..N {
        for c in 0..N {
            if board.get(r, c) != 0 {
                continue;
            }
            let opts: Vec<u8> = (1u8..=9u8)
                .filter(|&v| variant.can_place(board, r, c, v))
                .collect();
            if opts.is_empty() {
                return Some((r, c, opts));
            }
            let n = opts.len();
            match &best {
                Some((_, _, bo)) if bo.len() <= n => {}
                _ => best = Some((r, c, opts)),
            }
            if n == 1 {
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
        for r in 0..N {
            for c in 0..N {
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
}
