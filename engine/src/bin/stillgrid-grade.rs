//! CLI: grade a puzzle by required human-solving technique.
//!
//! Input modes:
//! - argv[1]: 81-char classic puzzle string.
//! - stdin (no argv): either an 81-char classic string OR a JSON object:
//!   {"givens":"...","variant":"classic|xsudoku|jigsaw|killer",
//!   "box_of":[...81 ints], "cages":[{"cells":[..],"sum":N}]}
//!   box_of is required for jigsaw, cages required for killer.

use std::collections::HashMap;
use std::io::{self, Read};
use stillgrid_engine::{
    grade_variant, Board, Cage, GradeOutcome, Step, Technique, Tier, Variant, VariantKind,
};

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
        Technique::HiddenSingleDiag => "HiddenSingleDiag",
        Technique::HiddenSingleCage => "HiddenSingleCage",
        Technique::NakedPairRow => "NakedPairRow",
        Technique::NakedPairCol => "NakedPairCol",
        Technique::NakedPairBox => "NakedPairBox",
        Technique::NakedPairDiag => "NakedPairDiag",
        Technique::NakedPairCage => "NakedPairCage",
        Technique::HiddenPairRow => "HiddenPairRow",
        Technique::HiddenPairCol => "HiddenPairCol",
        Technique::HiddenPairBox => "HiddenPairBox",
        Technique::HiddenPairDiag => "HiddenPairDiag",
        Technique::HiddenPairCage => "HiddenPairCage",
        Technique::PointingPair => "PointingPair",
        Technique::XWingRow => "XWingRow",
        Technique::XWingCol => "XWingCol",
        Technique::SwordfishRow => "SwordfishRow",
        Technique::SwordfishCol => "SwordfishCol",
        Technique::XYWing => "XYWing",
        Technique::Coloring => "Coloring",
        Technique::ForcingChain => "ForcingChain",
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

#[derive(Default)]
struct Input {
    givens: String,
    variant_kind: Option<String>,
    box_of: Option<Vec<u8>>,
    cages: Option<Vec<Cage>>,
}

fn parse_input(raw: &str) -> Result<Input, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("empty input".into());
    }
    if !trimmed.starts_with('{') {
        return Ok(Input {
            givens: trimmed.to_string(),
            ..Default::default()
        });
    }
    let v = parse_value(trimmed)?;
    let obj = match v {
        JsonValue::Object(m) => m,
        _ => return Err("expected JSON object".into()),
    };
    let mut input = Input::default();
    if let Some(g) = obj.get("givens") {
        input.givens = match g {
            JsonValue::String(s) => s.clone(),
            _ => return Err("givens must be a string".into()),
        };
    } else {
        return Err("missing 'givens'".into());
    }
    if let Some(v) = obj.get("variant") {
        input.variant_kind = Some(match v {
            JsonValue::String(s) => s.clone(),
            _ => return Err("variant must be a string".into()),
        });
    }
    if let Some(b) = obj.get("box_of") {
        let arr = match b {
            JsonValue::Array(a) => a,
            _ => return Err("box_of must be an array".into()),
        };
        let mut out = Vec::with_capacity(81);
        for item in arr {
            let n = match item {
                JsonValue::Number(n) => *n,
                _ => return Err("box_of items must be numbers".into()),
            };
            if !(0.0..=8.0).contains(&n) {
                return Err(format!("box_of value out of range: {n}"));
            }
            out.push(n as u8);
        }
        if out.len() != 81 {
            return Err(format!("box_of must be 81 entries, got {}", out.len()));
        }
        input.box_of = Some(out);
    }
    if let Some(c) = obj.get("cages") {
        let arr = match c {
            JsonValue::Array(a) => a,
            _ => return Err("cages must be an array".into()),
        };
        let mut out = Vec::new();
        for item in arr {
            let m = match item {
                JsonValue::Object(o) => o,
                _ => return Err("each cage must be an object".into()),
            };
            let cells_v = m.get("cells").ok_or("cage missing 'cells'")?;
            let sum_v = m.get("sum").ok_or("cage missing 'sum'")?;
            let cells_arr = match cells_v {
                JsonValue::Array(a) => a,
                _ => return Err("cage.cells must be an array".into()),
            };
            let mut cells = Vec::with_capacity(cells_arr.len());
            for ci in cells_arr {
                let n = match ci {
                    JsonValue::Number(n) => *n,
                    _ => return Err("cage cell must be a number".into()),
                };
                if !(0.0..=80.0).contains(&n) {
                    return Err(format!("cage cell out of range: {n}"));
                }
                cells.push(n as usize);
            }
            let sum = match sum_v {
                JsonValue::Number(n) => *n as u32,
                _ => return Err("cage.sum must be a number".into()),
            };
            out.push(Cage { cells, sum });
        }
        input.cages = Some(out);
    }
    Ok(input)
}

// --- minimal JSON parser (no deps) ---------------------------------------

#[derive(Debug)]
enum JsonValue {
    #[allow(dead_code)]
    Null,
    #[allow(dead_code)]
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<JsonValue>),
    Object(std::collections::BTreeMap<String, JsonValue>),
}

fn parse_value(s: &str) -> Result<JsonValue, String> {
    let mut p = JsonParser::new(s);
    p.skip_ws();
    let v = p.parse_any()?;
    p.skip_ws();
    if !p.eof() {
        return Err(format!("trailing data at offset {}", p.pos));
    }
    Ok(v)
}

struct JsonParser<'a> {
    src: &'a [u8],
    pos: usize,
}

impl<'a> JsonParser<'a> {
    fn new(s: &'a str) -> Self {
        JsonParser {
            src: s.as_bytes(),
            pos: 0,
        }
    }
    fn eof(&self) -> bool {
        self.pos >= self.src.len()
    }
    fn peek(&self) -> Option<u8> {
        self.src.get(self.pos).copied()
    }
    fn bump(&mut self) -> Option<u8> {
        let b = self.peek();
        if b.is_some() {
            self.pos += 1;
        }
        b
    }
    fn skip_ws(&mut self) {
        while let Some(b) = self.peek() {
            if matches!(b, b' ' | b'\t' | b'\n' | b'\r') {
                self.pos += 1;
            } else {
                break;
            }
        }
    }
    fn expect(&mut self, b: u8) -> Result<(), String> {
        if self.peek() == Some(b) {
            self.pos += 1;
            Ok(())
        } else {
            Err(format!("expected '{}' at offset {}", b as char, self.pos))
        }
    }
    fn parse_any(&mut self) -> Result<JsonValue, String> {
        self.skip_ws();
        match self.peek() {
            Some(b'{') => self.parse_object(),
            Some(b'[') => self.parse_array(),
            Some(b'"') => self.parse_string().map(JsonValue::String),
            Some(b't') | Some(b'f') => self.parse_bool(),
            Some(b'n') => self.parse_null(),
            Some(b) if b == b'-' || b.is_ascii_digit() => self.parse_number(),
            _ => Err(format!("unexpected byte at offset {}", self.pos)),
        }
    }
    fn parse_object(&mut self) -> Result<JsonValue, String> {
        self.expect(b'{')?;
        let mut m = std::collections::BTreeMap::new();
        self.skip_ws();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(JsonValue::Object(m));
        }
        loop {
            self.skip_ws();
            let k = self.parse_string()?;
            self.skip_ws();
            self.expect(b':')?;
            let v = self.parse_any()?;
            m.insert(k, v);
            self.skip_ws();
            match self.peek() {
                Some(b',') => {
                    self.pos += 1;
                }
                Some(b'}') => {
                    self.pos += 1;
                    return Ok(JsonValue::Object(m));
                }
                _ => return Err(format!("expected ',' or '}}' at offset {}", self.pos)),
            }
        }
    }
    fn parse_array(&mut self) -> Result<JsonValue, String> {
        self.expect(b'[')?;
        let mut a = Vec::new();
        self.skip_ws();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(JsonValue::Array(a));
        }
        loop {
            let v = self.parse_any()?;
            a.push(v);
            self.skip_ws();
            match self.peek() {
                Some(b',') => {
                    self.pos += 1;
                }
                Some(b']') => {
                    self.pos += 1;
                    return Ok(JsonValue::Array(a));
                }
                _ => return Err(format!("expected ',' or ']' at offset {}", self.pos)),
            }
        }
    }
    fn parse_string(&mut self) -> Result<String, String> {
        self.expect(b'"')?;
        let mut s = String::new();
        loop {
            match self.bump() {
                Some(b'"') => return Ok(s),
                Some(b'\\') => match self.bump() {
                    Some(b'"') => s.push('"'),
                    Some(b'\\') => s.push('\\'),
                    Some(b'/') => s.push('/'),
                    Some(b'n') => s.push('\n'),
                    Some(b't') => s.push('\t'),
                    Some(b'r') => s.push('\r'),
                    _ => return Err("unsupported escape".into()),
                },
                Some(b) => s.push(b as char),
                None => return Err("unterminated string".into()),
            }
        }
    }
    fn parse_bool(&mut self) -> Result<JsonValue, String> {
        if self.src[self.pos..].starts_with(b"true") {
            self.pos += 4;
            Ok(JsonValue::Bool(true))
        } else if self.src[self.pos..].starts_with(b"false") {
            self.pos += 5;
            Ok(JsonValue::Bool(false))
        } else {
            Err(format!("invalid literal at offset {}", self.pos))
        }
    }
    fn parse_null(&mut self) -> Result<JsonValue, String> {
        if self.src[self.pos..].starts_with(b"null") {
            self.pos += 4;
            Ok(JsonValue::Null)
        } else {
            Err(format!("invalid literal at offset {}", self.pos))
        }
    }
    fn parse_number(&mut self) -> Result<JsonValue, String> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        while let Some(b) = self.peek() {
            if b.is_ascii_digit() || matches!(b, b'.' | b'e' | b'E' | b'+' | b'-') {
                self.pos += 1;
            } else {
                break;
            }
        }
        let s = std::str::from_utf8(&self.src[start..self.pos])
            .map_err(|_| "invalid utf8 in number".to_string())?;
        let n: f64 = s
            .parse()
            .map_err(|e: std::num::ParseFloatError| e.to_string())?;
        Ok(JsonValue::Number(n))
    }
}

fn build_variant(input: &Input) -> Result<Variant, String> {
    let kind = input.variant_kind.as_deref().unwrap_or("classic");
    let kind = VariantKind::parse(kind).ok_or_else(|| format!("unknown variant: {kind}"))?;
    match kind {
        VariantKind::Classic => Ok(Variant::classic()),
        VariantKind::XSudoku => Ok(Variant::xsudoku()),
        VariantKind::Jigsaw => {
            let bo = input.box_of.as_ref().ok_or("jigsaw requires box_of")?;
            let mut arr = [0u8; 81];
            for (i, &v) in bo.iter().enumerate() {
                arr[i] = v;
            }
            Ok(Variant::jigsaw(arr))
        }
        VariantKind::Killer => {
            let cages = input.cages.as_ref().ok_or("killer requires cages")?;
            Ok(Variant::killer(cages.clone()))
        }
    }
}

fn run() -> Result<String, String> {
    let raw = read_input()?;
    let input = parse_input(&raw)?;
    let board = Board::from_str(&input.givens)?;
    let variant = build_variant(&input)?;
    let result = grade_variant(&board, &variant);
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
