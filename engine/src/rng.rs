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
        Rng {
            state: seed.wrapping_add(0x9E37_79B9_7F4A_7C15),
        }
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
    pub fn gen_range(&mut self, n: usize) -> usize {
        (self.next_u64() as usize) % n.max(1)
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
    pub fn from_entropy() -> Self {
        use std::time::{SystemTime, UNIX_EPOCH};
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        // Mix in process id for a bit more entropy across rapid restarts.
        let pid = std::process::id() as u64;
        Rng::new(nanos ^ pid.wrapping_mul(0x9E37_79B9_7F4A_7C15))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
