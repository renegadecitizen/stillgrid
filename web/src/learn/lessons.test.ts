import { describe, it, expect } from "vitest";
import { LESSONS } from "./lessons";

const REQUIRED_IDS = [
  "naked-single",
  "hidden-single",
  "naked-pair",
  "pointing-pair",
  "x-wing",
  "xy-wing",
  "swordfish",
  "coloring",
  "x-sudoku",
  "jigsaw",
  "killer",
];

describe("LESSONS", () => {
  it("includes every required lesson id exactly once", () => {
    const ids = LESSONS.map((l) => l.id);
    for (const id of REQUIRED_IDS) {
      expect(ids.filter((x) => x === id)).toHaveLength(1);
    }
    expect(LESSONS).toHaveLength(REQUIRED_IDS.length);
  });

  it("each lesson is internally consistent", () => {
    for (const l of LESSONS) {
      const cells = l.size * l.size;
      expect(l.steps.length, `${l.id} has steps`).toBeGreaterThan(0);
      if (l.regions) {
        expect(l.regions.length, `${l.id} regions cover the grid`).toBe(cells);
        const counts = new Map<number, number>();
        for (const id of l.regions) counts.set(id, (counts.get(id) ?? 0) + 1);
        for (const [id, n] of counts) {
          expect(n, `${l.id} region ${id} has ${l.size} cells`).toBe(l.size);
        }
      }
      for (const step of l.steps) {
        expect(step.caption.trim().length, `${l.id} caption non-empty`).toBeGreaterThan(0);
        expect(step.grid.length, `${l.id} grid is size²`).toBe(cells);
        for (const h of step.highlights) {
          for (const c of h.cells) {
            expect(c, `${l.id} highlight in range`).toBeGreaterThanOrEqual(0);
            expect(c, `${l.id} highlight in range`).toBeLessThan(cells);
          }
        }
        for (const cell of step.grid) {
          for (const d of cell.cands ?? []) {
            expect(d).toBeGreaterThanOrEqual(1);
            expect(d).toBeLessThanOrEqual(l.size);
          }
        }
      }
    }
  });
});
