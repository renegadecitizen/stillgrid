//! 9x9 sudoku board representation.

pub const N: usize = 9;
pub const CELLS: usize = N * N;

/// 0 = empty cell. 1..=9 = filled.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Board(pub [u8; CELLS]);

impl Board {
    pub fn empty() -> Self {
        Board([0u8; CELLS])
    }

    /// Parse from an 81-char string. '.' or '0' = empty, '1'..='9' = filled.
    #[allow(clippy::should_implement_trait)] // method name matches intent; error type differs from FromStr
    pub fn from_str(s: &str) -> Result<Self, String> {
        let trimmed: String = s.chars().filter(|c| !c.is_whitespace()).collect();
        if trimmed.len() != CELLS {
            return Err(format!("expected {} chars, got {}", CELLS, trimmed.len()));
        }
        let mut b = Board::empty();
        for (i, c) in trimmed.chars().enumerate() {
            b.0[i] = match c {
                '.' | '0' => 0,
                '1'..='9' => c.to_digit(10).unwrap() as u8,
                other => return Err(format!("bad char {} at {}", other, i)),
            };
        }
        Ok(b)
    }

    pub fn to_string_dotted(&self) -> String {
        self.0.iter().map(|&v| if v == 0 { '.' } else { (b'0' + v) as char }).collect()
    }

    #[inline]
    pub fn get(&self, row: usize, col: usize) -> u8 {
        self.0[row * N + col]
    }

    #[inline]
    pub fn set(&mut self, row: usize, col: usize, v: u8) {
        self.0[row * N + col] = v;
    }

    /// True if placing `v` at (row, col) violates no row/col/box constraint.
    pub fn can_place(&self, row: usize, col: usize, v: u8) -> bool {
        for i in 0..N {
            if self.get(row, i) == v || self.get(i, col) == v {
                return false;
            }
        }
        let br = (row / 3) * 3;
        let bc = (col / 3) * 3;
        for r in br..br + 3 {
            for c in bc..bc + 3 {
                if self.get(r, c) == v {
                    return false;
                }
            }
        }
        true
    }

    pub fn is_complete(&self) -> bool {
        self.0.iter().all(|&v| v != 0)
    }

    /// True if all currently-filled cells respect row/col/box constraints.
    /// Empty cells are ignored.
    pub fn is_consistent(&self) -> bool {
        for r in 0..N {
            for c in 0..N {
                let v = self.get(r, c);
                if v == 0 {
                    continue;
                }
                for i in 0..N {
                    if i != c && self.get(r, i) == v {
                        return false;
                    }
                    if i != r && self.get(i, c) == v {
                        return false;
                    }
                }
                let br = (r / 3) * 3;
                let bc = (c / 3) * 3;
                for rr in br..br + 3 {
                    for cc in bc..bc + 3 {
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
}
