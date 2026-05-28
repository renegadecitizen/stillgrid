//! CLI: read an 81-char puzzle string from argv[1] or stdin, print JSON result.
//!
//!   echo "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79" \
//!     | stillgrid-solve
//!
//!   {"outcome":"unique","solution":"534678912..."}
//!   {"outcome":"multiple"}
//!   {"outcome":"unsolvable"}
//!   {"outcome":"error","error":"..."}
//!
//! Phase 0: server sidecar pattern. The server spawns this binary per request.
//! Replace with persistent process + JSON-lines protocol in Phase 2 once we
//! generate puzzles rather than just solve them.

use std::io::{self, Read};
use stillgrid_engine::{solve, Board, SolveOutcome};

fn read_input() -> Result<String, String> {
    let arg = std::env::args().nth(1);
    if let Some(s) = arg {
        return Ok(s);
    }
    let mut buf = String::new();
    io::stdin().read_to_string(&mut buf).map_err(|e| format!("stdin read failed: {e}"))?;
    Ok(buf)
}

fn run() -> Result<String, String> {
    let raw = read_input()?;
    let board = Board::from_str(&raw)?;
    let outcome = solve(&board);
    Ok(match outcome {
        SolveOutcome::Unique(s) => {
            format!(r#"{{"outcome":"unique","solution":"{}"}}"#, s.to_string_dotted())
        }
        SolveOutcome::Multiple => r#"{"outcome":"multiple"}"#.into(),
        SolveOutcome::Unsolvable => r#"{"outcome":"unsolvable"}"#.into(),
    })
}

fn main() {
    match run() {
        Ok(json) => println!("{json}"),
        Err(e) => {
            let escaped = e.replace('\\', "\\\\").replace('"', "\\\"");
            println!(r#"{{"outcome":"error","error":"{escaped}"}}"#);
            std::process::exit(1);
        }
    }
}
