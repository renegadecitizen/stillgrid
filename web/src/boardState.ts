/**
 * Mutable play state for one puzzle in progress.
 *
 * - `values[i]`: user-entered digit, or 0 if empty (given values also live
 *   here — they're set from the puzzle's `givens` at init time).
 * - `notes[i]`: bitmask of candidate digits 1..9 (bit `d` set ↔ note `d`).
 *   Empty for cells that have a value (we clear notes on placement).
 *
 * Undo/redo works by snapshotting the whole state on every change. 81 cells
 * × tiny payload → ~hundreds of bytes per snapshot; cheap.
 */

export interface BoardState {
  values: Uint8Array;   // length 81, 0..9
  notes: Uint16Array;   // length 81, bits 1..9
  givenMask: Uint8Array; // length 81, 1 if given (immutable), 0 otherwise
}

export function initialState(givens: string): BoardState {
  const values = new Uint8Array(81);
  const notes = new Uint16Array(81);
  const givenMask = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    const ch = givens[i];
    if (ch && ch >= "1" && ch <= "9") {
      values[i] = ch.charCodeAt(0) - 48;
      givenMask[i] = 1;
    }
  }
  return { values, notes, givenMask };
}

export function cloneState(s: BoardState): BoardState {
  return {
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
  for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d);
  return out;
}

/** Set value at i; clears notes there; auto-prunes that digit from peer
 *  notes. Returns a new state. */
export function placeValue(s: BoardState, i: number, v: number): BoardState {
  if (isGiven(s, i)) return s;
  const next = cloneState(s);
  next.values[i] = v;
  next.notes[i] = 0;
  // Auto-prune `v` from peers' notes (row + col + box)
  const r = Math.floor(i / 9);
  const c = i % 9;
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  const mask = ~(1 << v) & 0x3ff;
  for (let k = 0; k < 9; k++) {
    next.notes[r * 9 + k]! &= mask;
    next.notes[k * 9 + c]! &= mask;
  }
  for (let rr = br; rr < br + 3; rr++) {
    for (let cc = bc; cc < bc + 3; cc++) {
      next.notes[rr * 9 + cc]! &= mask;
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
  for (let i = 0; i < 81; i++) if (s.notes[i]) { any = true; break; }
  if (!any) return s;
  const next = cloneState(s);
  next.notes.fill(0);
  return next;
}

/** Fill every empty cell with all logically valid candidates (row/col/box
 *  constraints only — doesn't honor diagonals/cages here, which is fine for
 *  a "suggestion" feature; players can prune further). */
export function autoPencil(s: BoardState): BoardState {
  const next = cloneState(s);
  for (let i = 0; i < 81; i++) {
    if (isGiven(next, i)) continue;
    if (next.values[i] !== 0) continue;
    let mask = 0;
    const r = Math.floor(i / 9);
    const c = i % 9;
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let d = 1; d <= 9; d++) {
      let conflict = false;
      for (let k = 0; k < 9 && !conflict; k++) {
        if (next.values[r * 9 + k] === d) conflict = true;
        if (next.values[k * 9 + c] === d) conflict = true;
      }
      if (!conflict) {
        for (let rr = br; rr < br + 3 && !conflict; rr++) {
          for (let cc = bc; cc < bc + 3 && !conflict; cc++) {
            if (next.values[rr * 9 + cc] === d) conflict = true;
          }
        }
      }
      if (!conflict) mask |= 1 << d;
    }
    next.notes[i] = mask;
  }
  return next;
}

/** Are all 81 values set, every non-given matching the solution? */
export function isSolved(s: BoardState, solution: string): boolean {
  for (let i = 0; i < 81; i++) {
    const sv = s.values[i] ?? 0;
    if (sv === 0) return false;
    const expected = solution.charCodeAt(i) - 48;
    if (sv !== expected) return false;
  }
  return true;
}
