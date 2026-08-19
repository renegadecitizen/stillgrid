//! CLI: read a 36/81/256-char puzzle string from argv[1] or stdin, print JSON.
//!
//!   echo "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79" \
//!     | stillgrid-solve
//!
//!   {"outcome":"unique","solution":"534678912..."}
//!   {"outcome":"multiple"}
//!   {"outcome":"unsolvable"}
//!   {"outcome":"error","error":"..."}
//!
//! The solving wire format lives in `stillgrid_engine::wire` so that this
//! binary and the WebAssembly build emit identical JSON.

use std::io::{self, Read};
use stillgrid_engine::{error_json, solve_json};

fn read_input() -> Result<String, String> {
    if let Some(s) = std::env::args().nth(1) {
        return Ok(s);
    }
    let mut buf = String::new();
    io::stdin().read_to_string(&mut buf).map_err(|e| format!("stdin read failed: {e}"))?;
    Ok(buf)
}

fn main() {
    match read_input().and_then(|raw| solve_json(&raw)) {
        Ok(json) => println!("{json}"),
        Err(e) => {
            println!("{}", error_json(&e));
            std::process::exit(1);
        }
    }
}
