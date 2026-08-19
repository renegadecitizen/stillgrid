//! Minimal deterministic PRNG (splitmix64). Zero deps.
//!
//! Phase 1 keeps the engine dependency-free. Swap to the `rand` crate
//! later if we need distributions beyond uniform u64 / shuffle.

#[derive(Clone, Copy, Debug)]
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng { state: seed.wrapping_add(0x9E37_79B9_7F4A_7C15) }
    }

    pub fn next_u64(&mut self) -> u64 {
        // splitmix64
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform integer in 0..n.
    ///
    /// The modulo is deliberately taken in `u64` rather than `usize`. `usize`
    /// is 64-bit on the build machine but **32-bit on wasm32**, so casting the
    /// raw draw to `usize` first would truncate to the low 32 bits in the
    /// browser and yield a different sequence from the same seed. That would
    /// desynchronise the daily archive — pre-rendered natively at build time —
    /// from the puzzle the browser generates for that same date.
    ///
    /// On 64-bit this is arithmetically identical to the previous
    /// `(next_u64() as usize) % n`, so every already-published puzzle,
    /// including the graded samples baked into the landing pages, is unchanged.
    pub fn gen_range(&mut self, n: usize) -> usize {
        (self.next_u64() % (n.max(1) as u64)) as usize
    }

    /// Fisher–Yates shuffle in place.
    pub fn shuffle<T>(&mut self, slice: &mut [T]) {
        let n = slice.len();
        for i in (1..n).rev() {
            let j = self.gen_range(i + 1);
            slice.swap(i, j);
        }
    }

    /// Seed from the current system time + a small mix. For non-test callers.
    ///
    /// Not available on wasm32: the browser build has no clock or pid to draw
    /// from, and every call site there passes an explicit seed so that puzzles
    /// stay reproducible against the pre-rendered daily archive.
    #[cfg(not(target_arch = "wasm32"))]
    pub fn from_entropy() -> Self {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos =
            SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0);
        // Mix in process id for a bit more entropy across rapid restarts.
        let pid = std::process::id() as u64;
        Rng::new(nanos ^ pid.wrapping_mul(0x9E37_79B9_7F4A_7C15))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Guards the wasm32 hazard in `gen_range`.
    ///
    /// `usize` is 64-bit on the build machine and 32-bit in the browser. If
    /// `gen_range` cast the raw draw to `usize` before taking the modulo, the
    /// browser would truncate to the low 32 bits and produce a different
    /// sequence from the same seed — desynchronising the natively pre-rendered
    /// daily archive from the puzzle the browser generates for that date.
    ///
    /// Seed 1 with modulus 3 is a case where the two forms actually disagree
    /// (1 vs 0), so this fails if the truncating cast is ever reintroduced.
    #[test]
    fn gen_range_takes_the_modulo_in_64_bits() {
        let raw = Rng::new(1).next_u64();
        assert_ne!(
            raw % 3,
            u64::from(raw as u32) % 3,
            "seed no longer distinguishes the two forms; pick another"
        );
        assert_eq!(Rng::new(1).gen_range(3) as u64, raw % 3);
    }

    #[test]
    fn deterministic_from_seed() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        for _ in 0..100 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
    }

    #[test]
    fn shuffle_preserves_set() {
        let mut r = Rng::new(7);
        let mut v: Vec<u32> = (0..50).collect();
        let orig = v.clone();
        r.shuffle(&mut v);
        v.sort();
        assert_eq!(v, orig);
    }
}
