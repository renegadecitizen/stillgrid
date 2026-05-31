import { describe, it, expect } from "vitest";
import { generate } from "./engine.js";
import { parseSize } from "./index.js";

// Integration test: spawns the real Rust binary at engine/target/release.
describe("generate size", () => {
  it("produces a 36-char 6×6 board", async () => {
    const p = await generate({ variant: "classic", size: 6, seed: 1 });
    expect(p.givens.length).toBe(36);
    expect(p.solution.length).toBe(36);
  });
  it("produces an 81-char 9×9 board by default", async () => {
    const p = await generate({ variant: "classic", seed: 1 });
    expect(p.givens.length).toBe(81);
  });
  it("6×6 jigsaw box_of has 36 entries, not 256", async () => {
    const p = await generate({ variant: "jigsaw", size: 6, seed: 1 });
    expect(p.box_of?.length).toBe(36);
  });
});

describe("parseSize", () => {
  it("defaults to 9 when absent", () => expect(parseSize(undefined)).toBe(9));
  it("accepts 6 and 9", () => {
    expect(parseSize("6")).toBe(6);
    expect(parseSize("9")).toBe(9);
  });
  it("rejects 16 (deferred) and junk with null", () => {
    expect(parseSize("16")).toBeNull();
    expect(parseSize("7")).toBeNull();
    expect(parseSize("abc")).toBeNull();
  });
});
