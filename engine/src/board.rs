//! Generalized sudoku board: any size n in {6, 9, 16}.

pub const MAX_N: usize = 16;
pub const MAX_CELLS: usize = MAX_N * MAX_N;

/// Box geometry per size. 6×6 boxes are 2 tall × 3 wide (not √n).
/// Lives here (not variant.rs) so `Board::can_place` can use it without a cycle.
pub fn box_dims(n: usize) -> (usize, usize) {
    match n {
        6 => (2, 3),
        9 => (3, 3),
        16 => (4, 4),
        _ => panic!("unsupported size {n}"),
    }
}

/// Encode a digit (0 = empty) to its display char: 1-9 -> '1'..'9', 10-16 -> 'A'..'G'.
pub fn digit_to_char(v: u8) -> char {
    match v {
        0 => '.',
        1..=9 => (b'0' + v) as char,
        10..=16 => (b'A' + (v - 10)) as char,
        _ => '?',
    }
}

/// Decode a display char to a digit (0 = empty). Returns None on bad char.
pub fn char_to_digit(c: char) -> Option<u8> {
    match c {
        '.' | '0' => Some(0),
        '1'..='9' => Some(c as u8 - b'0'),
        'A'..='G' => Some(10 + (c as u8 - b'A')),
        _ => None,
    }
}

fn size_from_len(len: usize) -> Option<u8> {
    match len {
        36 => Some(6),
        81 => Some(9),
        256 => Some(16),
        _ => None,
    }
}

/// Tuple struct: `.0` = cells buffer (first n*n live), `.1` = n.
/// Tuple layout preserves existing `board.0[idx]` access across the crate.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Board(pub [u8; MAX_CELLS], pub u8);

impl Board {
    pub fn empty() -> Self {
        Self::empty_n(9)
    }

    pub fn empty_n(n: usize) -> Self {
        assert!(matches!(n, 6 | 9 | 16), "unsupported size {n}");
        Board([0u8; MAX_CELLS], n as u8)
    }

    #[inline]
    pub fn n(&self) -> usize {
        self.1 as usize
    }

    #[inline]
    pub fn cells(&self) -> usize {
        self.n() * self.n()
    }

    /// Parse from a 36/81/256-char string. Size is inferred from length.
    #[allow(clippy::should_implement_trait)] // method name matches intent; error type differs from FromStr
    pub fn from_str(s: &str) -> Result<Self, String> {
        let trimmed: String = s.chars().filter(|c| !c.is_whitespace()).collect();
        let n = size_from_len(trimmed.len())
            .ok_or_else(|| format!("expected 36/81/256 chars, got {}", trimmed.len()))?;
        let mut b = Board::empty_n(n as usize);
        for (i, ch) in trimmed.chars().enumerate() {
            let d = char_to_digit(ch).ok_or_else(|| format!("bad char {ch} at {i}"))?;
            if d as usize > n as usize {
                return Err(format!("digit {d} out of range for size {n}"));
            }
            b.0[i] = d;
        }
        Ok(b)
    }

    pub fn to_string_dotted(&self) -> String {
        self.0[..self.cells()].iter().map(|&v| digit_to_char(v)).collect()
    }

    #[inline]
    pub fn get(&self, row: usize, col: usize) -> u8 {
        self.0[row * self.n() + col]
    }

    #[inline]
    pub fn set(&mut self, row: usize, col: usize, v: u8) {
        let n = self.n();
        self.0[row * n + col] = v;
    }

    /// True if placing `v` at (row, col) violates no row/col/box constraint.
    pub fn can_place(&self, row: usize, col: usize, v: u8) -> bool {
        let n = self.n();
        for i in 0..n {
            if self.get(row, i) == v || self.get(i, col) == v {
                return false;
            }
        }
        let (bh, bw) = box_dims(n);
        let br = (row / bh) * bh;
        let bc = (col / bw) * bw;
        for r in br..br + bh {
            for c in bc..bc + bw {
                if self.get(r, c) == v {
                    return false;
                }
            }
        }
        true
    }

    pub fn is_complete(&self) -> bool {
        self.0[..self.cells()].iter().all(|&v| v != 0)
    }

    /// True if all currently-filled cells respect row/col/box constraints.
    /// Empty cells are ignored.
    pub fn is_consistent(&self) -> bool {
        let n = self.n();
        let (bh, bw) = box_dims(n);
        for r in 0..n {
            for c in 0..n {
                let v = self.get(r, c);
                if v == 0 {
                    continue;
                }
                for i in 0..n {
                    if i != c && self.get(r, i) == v {
                        return false;
                    }
                    if i != r && self.get(i, c) == v {
                        return false;
                    }
                }
                let br = (r / bh) * bh;
                let bc = (c / bw) * bw;
                for rr in br..br + bh {
                    for cc in bc..bc + bw {
                        if (rr, cc) != (r, c) && self.get(rr, cc) == v {
                            return false;
                        }
                    }
                }
            }
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_and_render() {
        let s = "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
        let b = Board::from_str(s).unwrap();
        assert_eq!(b.to_string_dotted(), s);
    }

    #[test]
    fn rejects_wrong_length() {
        assert!(Board::from_str("123").is_err());
    }

    #[test]
    fn can_place_basic() {
        let mut b = Board::empty();
        b.set(0, 0, 5);
        assert!(!b.can_place(0, 5, 5));
        assert!(!b.can_place(5, 0, 5));
        assert!(!b.can_place(1, 1, 5));
        assert!(b.can_place(3, 3, 5));
    }

    #[test]
    fn board_sizes_6_9_16() {
        assert_eq!(Board::empty_n(6).cells(), 36);
        assert_eq!(Board::empty_n(9).cells(), 81);
        assert_eq!(Board::empty_n(16).cells(), 256);
        let mut b = Board::empty_n(6);
        b.set(5, 5, 4);
        assert_eq!(b.get(5, 5), 4);
    }

    #[test]
    fn box_dims_per_size() {
        assert_eq!(box_dims(6), (2, 3));
        assert_eq!(box_dims(9), (3, 3));
        assert_eq!(box_dims(16), (4, 4));
    }

    #[test]
    fn symbol_roundtrip_16() {
        // 16-char first row uses 1-9 then A-G; rest empty.
        let mut s = String::from("123456789ABCDEFG");
        s.push_str(&".".repeat(256 - 16));
        let b = Board::from_str(&s).unwrap();
        assert_eq!(b.n(), 16);
        assert_eq!(b.get(0, 9), 10); // 'A'
        assert_eq!(b.get(0, 15), 16); // 'G'
        assert_eq!(b.to_string_dotted(), s);
    }
}
