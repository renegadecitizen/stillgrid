//! Raw WebAssembly ABI for the browser build.
//!
//! Deliberately hand-rolled rather than `wasm-bindgen`: the engine has no
//! external dependencies and we want to keep it that way, so the production
//! build is a plain `cargo build --target wasm32-unknown-unknown` with no
//! extra CLI tooling to install or version-match in CI.
//!
//! ## Calling convention
//!
//! Strings cross the boundary as UTF-8 byte buffers. Inputs are written into
//! memory obtained from [`sg_alloc`] and released by the caller with
//! [`sg_free`]. Every fallible entry point returns a pointer to a
//! length-prefixed result buffer:
//!
//! ```text
//! [0..4]   u32 little-endian payload length N
//! [4..4+N] N bytes of UTF-8 JSON
//! ```
//!
//! The caller must hand that pointer back to [`sg_result_free`] exactly once.
//! Errors are not signalled out-of-band — they come back as the same
//! `{"outcome":"error","error":"..."}` JSON the CLI binaries print, so the
//! browser sees byte-identical payloads to the ones the old Express server
//! produced.
//!
//! These functions are compiled on every target, not just wasm32, so that
//! `cargo test` on a normal host still type-checks the ABI layer.

use crate::{error_json, generate_json, grade_json, solve_json, VariantKind};

/// Allocate `len` bytes for the caller to write an input string into.
///
/// # Safety
/// The returned pointer must be released with [`sg_free`] using the same
/// `len`, and must not be used after that.
#[no_mangle]
pub extern "C" fn sg_alloc(len: u32) -> *mut u8 {
    let mut buf: Vec<u8> = vec![0; len as usize];
    let ptr = buf.as_mut_ptr();
    core::mem::forget(buf);
    ptr
}

/// Release a buffer obtained from [`sg_alloc`].
///
/// # Safety
/// `ptr` must have come from [`sg_alloc`] with the same `len`, and must not
/// have been freed already.
#[no_mangle]
pub unsafe extern "C" fn sg_free(ptr: *mut u8, len: u32) {
    if ptr.is_null() {
        return;
    }
    drop(Vec::from_raw_parts(ptr, len as usize, len as usize));
}

/// Release a length-prefixed result buffer returned by one of the entry points.
///
/// # Safety
/// `ptr` must be a pointer returned by `sg_generate`/`sg_solve`/`sg_grade`
/// that has not already been freed.
#[no_mangle]
pub unsafe extern "C" fn sg_result_free(ptr: *mut u8) {
    if ptr.is_null() {
        return;
    }
    let mut len_bytes = [0u8; 4];
    core::ptr::copy_nonoverlapping(ptr, len_bytes.as_mut_ptr(), 4);
    let total = 4 + u32::from_le_bytes(len_bytes) as usize;
    drop(Vec::from_raw_parts(ptr, total, total));
}

/// Pack a JSON string into a freshly allocated length-prefixed buffer.
///
/// Uses an exact-capacity allocation so [`sg_result_free`] can reconstruct the
/// `Vec` from the length prefix alone.
fn pack(json: String) -> *mut u8 {
    let bytes = json.into_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(4 + bytes.len());
    out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(&bytes);
    debug_assert_eq!(out.len(), out.capacity(), "result buffer must be exactly sized");
    let mut boxed = out.into_boxed_slice();
    let ptr = boxed.as_mut_ptr();
    core::mem::forget(boxed);
    ptr
}

/// Read a caller-provided UTF-8 buffer back into a `&str`.
///
/// # Safety
/// `ptr`/`len` must describe an initialised buffer that stays valid for the
/// duration of the call.
unsafe fn read_str<'a>(ptr: *const u8, len: u32) -> Result<&'a str, String> {
    if ptr.is_null() {
        return Err("null input pointer".into());
    }
    let slice = core::slice::from_raw_parts(ptr, len as usize);
    core::str::from_utf8(slice).map_err(|e| format!("input is not valid UTF-8: {e}"))
}

/// Generate one puzzle.
///
/// `variant_ptr`/`variant_len` carry the variant name (`classic`, `xsudoku`,
/// `jigsaw`, `killer`). The seed is supplied by the caller — the browser build
/// has no entropy source of its own, and an explicit seed is what makes the
/// daily puzzles reproducible against the pre-rendered archive pages.
///
/// # Safety
/// See [`read_str`]; the variant buffer must be a valid UTF-8 range.
#[no_mangle]
pub unsafe extern "C" fn sg_generate(
    variant_ptr: *const u8,
    variant_len: u32,
    size: u32,
    min_clues: u32,
    seed: u64,
) -> *mut u8 {
    let name = match read_str(variant_ptr, variant_len) {
        Ok(s) => s,
        Err(e) => return pack(error_json(&e)),
    };
    let Some(variant) = VariantKind::parse(name) else {
        return pack(error_json(&format!("unknown variant: {name}")));
    };
    if !matches!(size, 6 | 9 | 16) {
        return pack(error_json(&format!("--size must be 6, 9, or 16; got {size}")));
    }
    pack(generate_json(seed, size as usize, variant, min_clues as usize))
}

/// Solve a plain puzzle string.
///
/// # Safety
/// See [`read_str`].
#[no_mangle]
pub unsafe extern "C" fn sg_solve(ptr: *const u8, len: u32) -> *mut u8 {
    let raw = match read_str(ptr, len) {
        Ok(s) => s,
        Err(e) => return pack(error_json(&e)),
    };
    pack(solve_json(raw).unwrap_or_else(|e| error_json(&e)))
}

/// Grade a puzzle string, or the richer JSON payload form for jigsaw/killer.
///
/// # Safety
/// See [`read_str`].
#[no_mangle]
pub unsafe extern "C" fn sg_grade(ptr: *const u8, len: u32) -> *mut u8 {
    let raw = match read_str(ptr, len) {
        Ok(s) => s,
        Err(e) => return pack(error_json(&e)),
    };
    pack(grade_json(raw).unwrap_or_else(|e| error_json(&e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Drive an entry point exactly the way the JS loader does: allocate,
    /// write, call, read the length prefix, free both sides.
    unsafe fn round_trip(
        input: &str,
        call: unsafe extern "C" fn(*const u8, u32) -> *mut u8,
    ) -> String {
        let bytes = input.as_bytes();
        let inp = sg_alloc(bytes.len() as u32);
        core::ptr::copy_nonoverlapping(bytes.as_ptr(), inp, bytes.len());

        let res = call(inp, bytes.len() as u32);
        let mut len_bytes = [0u8; 4];
        core::ptr::copy_nonoverlapping(res, len_bytes.as_mut_ptr(), 4);
        let n = u32::from_le_bytes(len_bytes) as usize;
        let payload =
            String::from_utf8(core::slice::from_raw_parts(res.add(4), n).to_vec()).unwrap();

        sg_result_free(res);
        sg_free(inp, bytes.len() as u32);
        payload
    }

    #[test]
    fn solve_round_trips_through_the_abi() {
        let puzzle =
            "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
        let out = unsafe { round_trip(puzzle, sg_solve) };
        assert!(out.contains(r#""outcome":"unique""#), "{out}");
    }

    #[test]
    fn grade_round_trips_through_the_abi() {
        let puzzle =
            "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
        let out = unsafe { round_trip(puzzle, sg_grade) };
        assert!(out.contains(r#""outcome":"solved""#), "{out}");
    }

    /// Bad input must come back as an error payload, never a panic — a panic
    /// in wasm poisons the module instance for the rest of the page's life.
    #[test]
    fn malformed_input_returns_error_json_not_a_panic() {
        let out = unsafe { round_trip("not a puzzle", sg_grade) };
        assert!(out.contains(r#""outcome":"error""#), "{out}");

        let out = unsafe { round_trip(r#"{"givens":"...","variant":"killer"}"#, sg_grade) };
        assert!(out.contains(r#""outcome":"error""#), "{out}");
    }

    #[test]
    fn generate_is_deterministic_for_a_given_seed() {
        let name = "classic";
        let run = || unsafe {
            let p = sg_alloc(name.len() as u32);
            core::ptr::copy_nonoverlapping(name.as_ptr(), p, name.len());
            let res = sg_generate(p, name.len() as u32, 9, 28, 12345);
            let mut lb = [0u8; 4];
            core::ptr::copy_nonoverlapping(res, lb.as_mut_ptr(), 4);
            let n = u32::from_le_bytes(lb) as usize;
            let s = String::from_utf8(core::slice::from_raw_parts(res.add(4), n).to_vec()).unwrap();
            sg_result_free(res);
            sg_free(p, name.len() as u32);
            s
        };
        let a = run();
        let b = run();
        assert_eq!(a, b, "same seed must yield the same puzzle");
        assert!(a.contains(r#""variant":"classic""#), "{a}");
    }

    #[test]
    fn unknown_variant_is_rejected_cleanly() {
        let name = "sudoku-x";
        let out = unsafe {
            let p = sg_alloc(name.len() as u32);
            core::ptr::copy_nonoverlapping(name.as_ptr(), p, name.len());
            let res = sg_generate(p, name.len() as u32, 9, 28, 1);
            let mut lb = [0u8; 4];
            core::ptr::copy_nonoverlapping(res, lb.as_mut_ptr(), 4);
            let n = u32::from_le_bytes(lb) as usize;
            let s = String::from_utf8(core::slice::from_raw_parts(res.add(4), n).to_vec()).unwrap();
            sg_result_free(res);
            sg_free(p, name.len() as u32);
            s
        };
        assert!(out.contains("unknown variant"), "{out}");
    }
}
