import { describe, it, expect, beforeEach } from "vitest";

beforeEach(() => {
  let store: Record<string, string> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    key: () => null,
    length: 0,
  };
});

import { getBest, recordRun } from "./storage";

describe("bests keyed by (variant, size, tier)", () => {
  it("6×6 and 9×9 bests for same variant+tier don't collide", () => {
    recordRun({ variant: "classic", size: 6, tierLabel: "easy", timeSec: 50, mistakes: 0, score: 100 });
    recordRun({ variant: "classic", size: 9, tierLabel: "easy", timeSec: 200, mistakes: 0, score: 100 });
    expect(getBest("classic", 6, "easy")?.bestTimeSec).toBe(50);
    expect(getBest("classic", 9, "easy")?.bestTimeSec).toBe(200);
  });
  it("keeps the faster time on repeat runs", () => {
    recordRun({ variant: "classic", size: 9, tierLabel: "easy", timeSec: 200, mistakes: 0, score: 1 });
    recordRun({ variant: "classic", size: 9, tierLabel: "easy", timeSec: 150, mistakes: 0, score: 1 });
    expect(getBest("classic", 9, "easy")?.bestTimeSec).toBe(150);
  });
  it("migrates legacy v1 bests into size=9", () => {
    localStorage.setItem(
      "stillgrid:bests:v1",
      JSON.stringify({ "classic-easy": { bestTimeSec: 123, bestMistakes: 0, bestScore: 1, solves: 1, lastSolvedAt: "2026-01-01T00:00:00.000Z" } })
    );
    expect(getBest("classic", 9, "easy")?.bestTimeSec).toBe(123);
    // a 6×6 lookup must NOT see the migrated 9×9 record
    expect(getBest("classic", 6, "easy")).toBeNull();
  });
});
