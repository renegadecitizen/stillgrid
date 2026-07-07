import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { generate, grade } from "./engine.js";
import { GRADE_VARIANTS, parseSize, variantSupportsSize } from "./index.js";

// These spawn the real Rust binary; they only run where it's been built
// (local dev, the engine CI job). The server CI job has no cargo build, so
// skip rather than fail with ENOENT. Mirrors engine.ts's binary resolution.
const ENGINE_DIR =
  process.env.STILLGRID_ENGINE_DIR ?? resolve(import.meta.dirname, "../../engine/target/release");
const HAVE_ENGINE = existsSync(resolve(ENGINE_DIR, "stillgrid-generate"));

describe.skipIf(!HAVE_ENGINE)("generate size", () => {
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
    expect(parseSize("16")).toBe(16);
    expect(parseSize("7")).toBeNull();
    expect(parseSize("abc")).toBeNull();
  });
});

describe("variantSupportsSize", () => {
  it("classic + xsudoku support 6, 9, 16", () => {
    for (const v of ["classic", "xsudoku"]) {
      expect(variantSupportsSize(v, 6)).toBe(true);
      expect(variantSupportsSize(v, 9)).toBe(true);
      expect(variantSupportsSize(v, 16)).toBe(true);
    }
  });
  it("jigsaw + killer support 6, 9 but NOT 16", () => {
    for (const v of ["jigsaw", "killer"]) {
      expect(variantSupportsSize(v, 9)).toBe(true);
      expect(variantSupportsSize(v, 16)).toBe(false);
    }
  });
});

describe("GRADE_VARIANTS", () => {
  it("allows exactly the string-only variants (no cage/box payloads)", () => {
    expect([...GRADE_VARIANTS].sort()).toEqual(["classic", "xsudoku"]);
  });
});

describe.skipIf(!HAVE_ENGINE)("grade with variant", () => {
  it("grades an xsudoku board via the JSON stdin path", async () => {
    const p = await generate({ variant: "xsudoku", seed: 7 });
    const g = await grade({ givens: p.givens, variant: "xsudoku" });
    expect(g.outcome).toBe("solved");
    if (g.outcome === "solved") {
      expect(g.tier).toBeGreaterThanOrEqual(1);
      expect(Object.keys(g.technique_counts).length).toBeGreaterThan(0);
    }
  });
});
