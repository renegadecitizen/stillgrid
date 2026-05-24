//! CLI: generate a unique-solution sudoku puzzle.
//!
//!   stillgrid-generate                                  # classic, random seed
//!   stillgrid-generate --variant xsudoku
//!   stillgrid-generate --variant jigsaw --seed 42
//!   stillgrid-generate --variant killer
//!   stillgrid-generate --count 100                      # bench mode, JSON-lines
//!
//! Output JSON includes variant-specific extras:
//!   classic / xsudoku:   {"variant","givens","solution","clue_count"}
//!   jigsaw:              ... + "box_of":[81 ints]
//!   killer:              ... + "cages":[{"cells":[..],"sum":N},...]

use std::time::Instant;
use stillgrid_engine::{generate_for, Rng, VariantKind};

struct Args {
    seed: Option<u64>,
    min_clues: usize,
    count: usize,
    variant: VariantKind,
}

fn parse_args() -> Result<Args, String> {
    let mut seed: Option<u64> = None;
    let mut min_clues: usize = 28;
    let mut count: usize = 1;
    let mut variant = VariantKind::Classic;

    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--seed" => {
                seed = Some(
                    it.next()
                        .ok_or("--seed needs a value")?
                        .parse()
                        .map_err(|e: std::num::ParseIntError| e.to_string())?,
                );
            }
            "--min-clues" => {
                min_clues = it
                    .next()
                    .ok_or("--min-clues needs a value")?
                    .parse()
                    .map_err(|e: std::num::ParseIntError| e.to_string())?;
            }
            "--count" => {
                count = it
                    .next()
                    .ok_or("--count needs a value")?
                    .parse()
                    .map_err(|e: std::num::ParseIntError| e.to_string())?;
            }
            "--variant" => {
                let v = it.next().ok_or("--variant needs a value")?;
                variant = VariantKind::parse(&v).ok_or(format!("unknown variant: {v}"))?;
            }
            other => return Err(format!("unknown arg: {other}")),
        }
    }
    Ok(Args {
        seed,
        min_clues,
        count,
        variant,
    })
}

fn render_puzzle_json(p: &stillgrid_engine::Puzzle) -> String {
    let mut out = String::new();
    out.push('{');
    out.push_str(&format!(r#""variant":"{}","#, p.variant.kind.as_str()));
    out.push_str(&format!(
        r#""givens":"{}","solution":"{}","clue_count":{}"#,
        p.givens.to_string_dotted(),
        p.solution.to_string_dotted(),
        p.clue_count
    ));
    // Jigsaw: include box partition
    if p.variant.kind == VariantKind::Jigsaw {
        let nums: Vec<String> = p.variant.box_of.iter().map(|b| b.to_string()).collect();
        out.push_str(&format!(r#","box_of":[{}]"#, nums.join(",")));
    }
    // Killer: include cages
    if p.variant.kind == VariantKind::Killer {
        let cages: Vec<String> = p
            .variant
            .cages
            .iter()
            .map(|c| {
                let cells: Vec<String> = c.cells.iter().map(|x| x.to_string()).collect();
                format!(r#"{{"cells":[{}],"sum":{}}}"#, cells.join(","), c.sum)
            })
            .collect();
        out.push_str(&format!(r#","cages":[{}]"#, cages.join(",")));
    }
    // X-Sudoku flag (for the renderer)
    if p.variant.kind == VariantKind::XSudoku {
        out.push_str(r#","diagonals":true"#);
    }
    out.push('}');
    out
}

fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(2);
        }
    };

    let mut rng = match args.seed {
        Some(s) => Rng::new(s),
        None => Rng::from_entropy(),
    };

    let started = Instant::now();
    let mut total_clues: usize = 0;

    for _ in 0..args.count {
        let p = generate_for(&mut rng, args.variant, args.min_clues);
        total_clues += p.clue_count;
        println!("{}", render_puzzle_json(&p));
    }

    if args.count > 1 {
        let elapsed = started.elapsed();
        let per = elapsed / args.count as u32;
        let avg_clues = total_clues as f64 / args.count as f64;
        eprintln!(
            "generated {} {} puzzles in {:?} ({:?} avg/puzzle, avg clue_count {:.1})",
            args.count,
            args.variant.as_str(),
            elapsed,
            per,
            avg_clues
        );
    }
}
