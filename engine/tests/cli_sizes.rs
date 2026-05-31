use std::process::Command;

// These tests run the compiled binaries — requires `cargo build --release` first (cargo test --release builds them).
fn bin(name: &str) -> String {
    // CARGO_MANIFEST_DIR = …/engine; target dir lives inside the crate root.
    format!("{}/target/release/{}", env!("CARGO_MANIFEST_DIR"), name)
}

// Pull a JSON string field value from the one-line generator output (no JSON dep).
fn json_str_field<'a>(s: &'a str, field: &str) -> &'a str {
    let needle = format!("\"{field}\":\"");
    s.split(&needle)
        .nth(1)
        .unwrap_or_else(|| panic!("field '{field}' not found in output: {s}"))
        .split('"')
        .next()
        .unwrap()
}

#[test]
fn generate_6x6_via_cli_is_36_chars() {
    let out = Command::new(bin("stillgrid-generate"))
        .args(["--variant", "classic", "--size", "6", "--seed", "1"])
        .output()
        .expect("run generate");
    assert!(out.status.success(), "generate failed: {}", String::from_utf8_lossy(&out.stderr));
    let s = String::from_utf8(out.stdout).unwrap();
    assert_eq!(json_str_field(&s, "solution").chars().count(), 36, "stdout: {s}");
    assert_eq!(json_str_field(&s, "givens").chars().count(), 36, "stdout: {s}");
}

#[test]
fn solve_6x6_via_stdin() {
    use std::io::Write;
    let givens = {
        let full = "123456456123231564564231312645645312";
        let mut v: Vec<char> = full.chars().collect();
        for i in 0..6 {
            v[i * 6 + i] = '.';
        }
        v.into_iter().collect::<String>()
    };
    let mut child = Command::new(bin("stillgrid-solve"))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("spawn solve");
    child.stdin.take().unwrap().write_all(givens.as_bytes()).unwrap();
    let out = child.wait_with_output().unwrap();
    let s = String::from_utf8(out.stdout).unwrap();
    assert!(s.contains("\"outcome\":\"unique\""), "expected unique, got: {s}");
}
