/**
 * Mutable play state for one puzzle in progress.
 *
 * - `values[i]`: user-entered digit, or 0 if empty (given values also live
 *   here — they're set from the puzzle's `givens` at init time).
 * - `notes[i]`: bitmask of candidate digits 1..n (bit `d` set ↔ note `d`).
 *   Empty for cells that have a value (we clear notes on placement).
 * - `n`: board size (6 or 9).
 *
 * Undo/redo works by snapshotting the whole state on every change. n*n cells
 * × tiny payload → ~hundreds of bytes per snapshot; cheap.
 */

export type Size = 6 | 9;

export interface BoardState {
  n: number;
  values: Uint8Array;    // length n*n, 0..n
  notes: Uint16Array;    // length n*n, bits 1..n (16 bits covers 1–9 and 1–6)
  givenMask: Uint8Array; // length n*n, 1 if given (immutable), 0 otherwise
}

// Board box geometry. 6×6 boxes are 2 rows × 3 cols (NOT √n).
export function boxDims(n: number): { bh: number; bw: number } {
  if (n === 6) return { bh: 2, bw: 3 };
  return { bh: 3, bw: 3 }; // n === 9
}

export function defaultBoxOf(n: number): number[] {
  const { bh, bw } = boxDims(n);
  const boxesPerRow = n / bw;
  const out: number[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) out.push(Math.floor(r / bh) * boxesPerRow + Math.floor(c / bw));
  return out;
}

export function initialState(givens: string): BoardState {
  const n = givens.length === 36 ? 6 : 9;
  const cells = n * n;
  const values = new Uint8Array(cells);
  const notes = new Uint16Array(cells);
  const givenMask = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) {
    const ch = givens[i];
    if (ch && ch >= "1" && ch <= "9") {
      values[i] = ch.charCodeAt(0) - 48;
      givenMask[i] = 1;
    }
  }
  return { n, values, notes, givenMask };
}

export function cloneState(s: BoardState): BoardState {
  return {
    n: s.n,
    values: new Uint8Array(s.values),
    notes: new Uint16Array(s.notes),
    givenMask: s.givenMask, // immutable across the puzzle's lifetime
  };
}

export function isGiven(s: BoardState, i: number): boolean {
  return s.givenMask[i] === 1;
}

export function getValue(s: BoardState, i: number): number {
  return s.values[i] ?? 0;
}

export function hasNote(s: BoardState, i: number, d: number): boolean {
  return ((s.notes[i] ?? 0) & (1 << d)) !== 0;
}

export function listNotes(s: BoardState, i: number): number[] {
  const out: number[] = [];
  const m = s.notes[i] ?? 0;
  for (let d = 1; d <= s.n; d++) if (m & (1 << d)) out.push(d);
  return out;
}

/** Set value at i; clears notes there; auto-prunes that digit from peer
 *  notes. Returns a new state. */
export function placeValue(s: BoardState, i: number, v: number): BoardState {
  if (isGiven(s, i)) return s;
  const n = s.n;
  const next = cloneState(s);
  next.values[i] = v;
  next.notes[i] = 0;
  // Auto-prune `v` from peers' notes (row + col + box)
  const r = Math.floor(i / n);
  const c = i % n;
  const { bh, bw } = boxDims(n);
  const br = Math.floor(r / bh) * bh;
  const bc = Math.floor(c / bw) * bw;
  const mask = ~(1 << v) & 0x3ff;
  for (let k = 0; k < n; k++) {
    next.notes[r * n + k]! &= mask;
    next.notes[k * n + c]! &= mask;
  }
  for (let rr = br; rr < br + bh; rr++) {
    for (let cc = bc; cc < bc + bw; cc++) {
      next.notes[rr * n + cc]! &= mask;
    }
  }
  return next;
}

/** Clear value and notes at i. */
export function clearCell(s: BoardState, i: number): BoardState {
  if (isGiven(s, i)) return s;
  const next = cloneState(s);
  next.values[i] = 0;
  next.notes[i] = 0;
  return next;
}

/** Toggle note d at i (no-op if cell has a value or is given). */
export function toggleNote(s: BoardState, i: number, d: number): BoardState {
  if (isGiven(s, i)) return s;
  if ((s.values[i] ?? 0) !== 0) return s;
  const next = cloneState(s);
  next.notes[i]! ^= 1 << d;
  return next;
}

/** Wipe all notes from every cell. Keeps placed values intact. */
export function clearAllNotes(s: BoardState): BoardState {
  // Skip the work if there are no notes anywhere.
  let any = false;
  const cells = s.n * s.n;
  for (let i = 0; i < cells; i++) if (s.notes[i]) { any = true; break; }
  if (!any) return s;
  const next = cloneState(s);
  next.notes.fill(0);
  return next;
}

/** Fill every empty cell with all logically valid candidates (row/col/box
 *  constraints only — doesn't honor diagonals/cages here, which is fine for
 *  a "suggestion" feature; players can prune further). */
export function autoPencil(s: BoardState): BoardState {
  const n = s.n;
  const cells = n * n;
  const next = cloneState(s);
  const { bh, bw } = boxDims(n);
  for (let i = 0; i < cells; i++) {
    if (isGiven(next, i)) continue;
    if (next.values[i] !== 0) continue;
    let mask = 0;
    const r = Math.floor(i / n);
    const c = i % n;
    const br = Math.floor(r / bh) * bh;
    const bc = Math.floor(c / bw) * bw;
    for (let d = 1; d <= n; d++) {
      let conflict = false;
      for (let k = 0; k < n && !conflict; k++) {
        if (next.values[r * n + k] === d) conflict = true;
        if (next.values[k * n + c] === d) conflict = true;
      }
      if (!conflict) {
        for (let rr = br; rr < br + bh && !conflict; rr++) {
          for (let cc = bc; cc < bc + bw && !conflict; cc++) {
            if (next.values[rr * n + cc] === d) conflict = true;
          }
        }
      }
      if (!conflict) mask |= 1 << d;
    }
    next.notes[i] = mask;
  }
  return next;
}

/** Are all n*n values set, every non-given matching the solution? */
export function isSolved(s: BoardState, solution: string): boolean {
  const cells = s.n * s.n;
  for (let i = 0; i < cells; i++) {
    const sv = s.values[i] ?? 0;
    if (sv === 0) return false;
    const expected = solution.charCodeAt(i) - 48;
    if (sv !== expected) return false;
  }
  return true;
}
