//! CLI: grade a puzzle by required human-solving technique.
//!
//! Input modes:
//! - argv[1]: a 36/81/256-char puzzle string (size inferred from length).
//! - stdin (no argv): either a 36/81/256-char classic string OR a JSON object:
//!   {"givens":"...","variant":"classic|xsudoku|jigsaw|killer",
//!   "box_of":[...n*n ints], "cages":[{"cells":[..],"sum":N}]}
//!   box_of is n*n entries (required for jigsaw), cages required for killer.
//!
//! The parsing and rendering live in `stillgrid_engine::wire` so that this
//! binary and the WebAssembly build emit identical JSON.

use std::io::{self, Read};
use stillgrid_engine::{error_json, grade_json};

fn read_input() -> Result<String, String> {
    if let Some(s) = std::env::args().nth(1) {
        return Ok(s);
    }
    let mut buf = String::new();
    io::stdin().read_to_string(&mut buf).map_err(|e| format!("stdin read failed: {e}"))?;
    Ok(buf)
}

fn main() {
    match read_input().and_then(|raw| grade_json(&raw)) {
        Ok(json) => println!("{json}"),
        Err(e) => {
            println!("{}", error_json(&e));
            std::process::exit(1);
        }
    }
}
