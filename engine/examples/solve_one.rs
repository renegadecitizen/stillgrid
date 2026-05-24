//! Quick smoke test: solve a known easy puzzle and print the solution.
//!
//!   cargo run --release --example solve_one

use stillgrid_engine::{solve, Board, SolveOutcome};

const PUZZLE: &str =
    "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";

fn main() {
    let b = Board::from_str(PUZZLE).expect("valid puzzle");
    println!("input:    {}", b.to_string_dotted());
    match solve(&b) {
        SolveOutcome::Unique(s) => println!("solution: {}", s.to_string_dotted()),
        SolveOutcome::Multiple => println!("multiple solutions exist"),
        SolveOutcome::Unsolvable => println!("no solution"),
    }
}
