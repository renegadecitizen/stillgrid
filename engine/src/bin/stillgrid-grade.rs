//! CLI: grade a puzzle by required human-solving technique.

use std::collections::HashMap;
use std::io::{self, Read};
use stillgrid_engine::{grade, Board, GradeOutcome, Step, Technique, Tier};

fn read_input() -> Result<String, String> {
    if let Some(s) = std::env::args().nth(1) {
        return Ok(s);
    }
    let mut buf = String::new();
    io::stdin()
        .read_to_string(&mut buf)
        .map_err(|e| format!("stdin read failed: {e}"))?;
    Ok(buf)
}

fn tier_label(t: Tier) -> &'static str {
    match t {
        Tier::T1Easy => "easy",
        Tier::T2Medium => "medium",
        Tier::T3Hard => "hard",
        Tier::T4Diabolical => "diabolical",
        Tier::T5Nightmare => "nightmare",
    }
}

fn technique_name(t: Technique) -> &'static str {
    match t {
        Technique::NakedSingle => "NakedSingle",
        Technique::HiddenSingleRow => "HiddenSingleRow",
        Technique::HiddenSingleCol => "HiddenSingleCol",
        Technique::HiddenSingleBox => "HiddenSingleBox",
        Technique::NakedPairRow => "NakedPairRow",
        Technique::NakedPairCol => "NakedPairCol",
        Technique::NakedPairBox => "NakedPairBox",
        Technique::HiddenPairRow => "HiddenPairRow",
        Technique::HiddenPairCol => "HiddenPairCol",
        Technique::HiddenPairBox => "HiddenPairBox",
        Technique::PointingPair => "PointingPair",
        Technique::XWingRow => "XWingRow",
        Technique::XWingCol => "XWingCol",
    }
}

fn format_counts(counts: &HashMap<&'static str, u32>) -> String {
    let mut entries: Vec<_> = counts.iter().collect();
    entries.sort_by(|a, b| b.1.cmp(a.1).then(a.0.cmp(b.0)));
    let inner: Vec<String> = entries
        .iter()
        .map(|(k, v)| format!(r#""{k}":{v}"#))
        .collect();
    format!("{{{}}}", inner.join(","))
}

fn step_technique(s: &Step) -> Technique {
    s.technique()
}

fn run() -> Result<String, String> {
    let raw = read_input()?;
    let board = Board::from_str(&raw)?;
    let result = grade(&board);
    Ok(match result {
        GradeOutcome::Solved { steps, tier, .. } => {
            let mut counts: HashMap<&'static str, u32> = HashMap::new();
            for s in &steps {
                *counts.entry(technique_name(step_technique(s))).or_insert(0) += 1;
            }
            format!(
                r#"{{"outcome":"solved","tier":{},"tier_label":"{}","steps":{},"technique_counts":{}}}"#,
                tier as u8,
                tier_label(tier),
                steps.len(),
                format_counts(&counts)
            )
        }
        GradeOutcome::Stuck { steps, .. } => {
            format!(r#"{{"outcome":"stuck","steps_taken":{}}}"#, steps.len())
        }
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
