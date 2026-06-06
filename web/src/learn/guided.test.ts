import { describe, it, expect } from "vitest";
import { GUIDED_GAME, createGuided } from "./guided";

describe("GUIDED_GAME data", () => {
  it("has exactly 12 moves, all in range with non-empty captions", () => {
    expect(GUIDED_GAME.moves).toHaveLength(12);
    for (const m of GUIDED_GAME.moves) {
      expect(m.cell).toBeGreaterThanOrEqual(0);
      expect(m.cell).toBeLessThan(81);
      expect(m.digit).toBeGreaterThanOrEqual(1);
      expect(m.digit).toBeLessThanOrEqual(9);
      expect(m.caption.trim().length).toBeGreaterThan(0);
      for (const u of m.unit) {
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThan(81);
      }
    }
  });
  it("never targets a given cell, and no duplicate target cells", () => {
    const seen = new Set<number>();
    for (const m of GUIDED_GAME.moves) {
      expect(GUIDED_GAME.givens[m.cell]).toBeUndefined();
      expect(seen.has(m.cell)).toBe(false);
      seen.add(m.cell);
    }
  });
  it("givens form a legal partial grid (no dup in any row/col/box)", () => {
    const g = GUIDED_GAME.givens;
    const peers = (i: number) => {
      const r = Math.floor(i / 9), c = i % 9;
      const out = new Set<number>();
      for (let k = 0; k < 9; k++) { out.add(r * 9 + k); out.add(k * 9 + c); }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) out.add((br + dr) * 9 + (bc + dc));
      out.delete(i);
      return out;
    };
    for (const [k, v] of Object.entries(g)) {
      const i = Number(k);
      for (const p of peers(i)) if (g[p] !== undefined) expect(g[p]).not.toBe(v);
    }
  });
});

describe("createGuided", () => {
  it("starts at move 0, not complete", () => {
    const gu = createGuided(GUIDED_GAME);
    expect(gu.index).toBe(0);
    expect(gu.complete).toBe(false);
    expect(gu.current().cell).toBe(GUIDED_GAME.moves[0]!.cell);
  });
  it("advances only on the correct cell", () => {
    const gu = createGuided(GUIDED_GAME);
    const right = GUIDED_GAME.moves[0]!.cell;
    const wrong = right === 0 ? 1 : 0;
    expect(gu.attempt(wrong)).toBe(false);
    expect(gu.index).toBe(0);
    expect(gu.attempt(right)).toBe(true);
    expect(gu.index).toBe(1);
  });
  it("becomes complete after the last correct move", () => {
    const gu = createGuided(GUIDED_GAME);
    for (const m of GUIDED_GAME.moves) gu.attempt(m.cell);
    expect(gu.complete).toBe(true);
  });
  it("placed() accumulates givens + placed digits", () => {
    const gu = createGuided(GUIDED_GAME);
    gu.attempt(GUIDED_GAME.moves[0]!.cell);
    expect(gu.placed()[GUIDED_GAME.moves[0]!.cell]).toBe(GUIDED_GAME.moves[0]!.digit);
  });
});
