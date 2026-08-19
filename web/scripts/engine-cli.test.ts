/**
 * Engine-backed guards, carried over from the retired server's test suite.
 *
 * The important ones are at the bottom: several landing pages bake a specific
 * generated puzzle and make visible claims about it ("solved in 75 steps, five
 * forcing chains"). Those claims are only true for the engine that produced
 * them, so these tests regenerate each sample from its recorded seed and check
 * both the grid and the claims. Without them, a generator or grader change
 * would quietly turn published pages into lies.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { HAVE_ENGINE, generate, grade } from "./engine-cli.js";
import { variantSupportsSize } from "../src/engine/api.js";

// vitest runs with the package root as cwd.
const page = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe.skipIf(!HAVE_ENGINE)("generate size", () => {
  it("produces a 36-char 6×6 board", () => {
    const p = generate({ variant: "classic", size: 6, seed: 1 });
    expect(p.givens.length).toBe(36);
    expect(p.solution.length).toBe(36);
  });
  it("produces an 81-char 9×9 board by default", () => {
    const p = generate({ variant: "classic", seed: 1 });
    expect(p.givens.length).toBe(81);
  });
  it("6×6 jigsaw box_of has 36 entries, not 256", () => {
    const p = generate({ variant: "jigsaw", size: 6, seed: 1 });
    expect(p.box_of?.length).toBe(36);
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

describe.skipIf(!HAVE_ENGINE)("grade with variant", () => {
  it("grades an xsudoku board via the JSON payload path", () => {
    const p = generate({ variant: "xsudoku", seed: 7 });
    const g = grade({ givens: p.givens, variant: "xsudoku" });
    expect(g.outcome).toBe("solved");
    if (g.outcome === "solved") {
      expect(g.tier).toBeGreaterThanOrEqual(1);
      expect(Object.keys(g.technique_counts).length).toBeGreaterThan(0);
    }
  });
});

/** Regenerate a page's baked sample from its recorded seed. */
function pageSample(file: string) {
  const html = page(file);
  const seed = Number(/data-sample-seed="(\d+)"/.exec(html)?.[1]);
  const minClues = Number(/data-sample-min-clues="(\d+)"/.exec(html)?.[1]);
  const givens = /data-sample-givens="([.\d]+)"/.exec(html)?.[1];
  expect(seed).toBeGreaterThan(0);
  expect(givens).toHaveLength(81);

  const p = generate({ variant: "classic", seed, minClues });
  expect(p.givens).toBe(givens);

  const g = grade(p.givens);
  expect(g.outcome).toBe("solved");
  return g.outcome === "solved" ? g : null;
}

describe.skipIf(!HAVE_ENGINE)("evil-sudoku baked sample", () => {
  it("matches its seed and still grades nightmare with the claimed path", () => {
    const g = pageSample("public/evil-sudoku.html");
    expect(g?.tier_label).toBe("nightmare");
    // The page's visible claims: 75 steps, chains ×5, XY-Wing ×2, X-Wing ×2.
    expect(g?.steps).toBe(75);
    expect(g?.technique_counts["ForcingChain"]).toBe(5);
    expect(g?.technique_counts["XYWing"]).toBe(2);
    expect(
      (g?.technique_counts["XWingRow"] ?? 0) + (g?.technique_counts["XWingCol"] ?? 0),
    ).toBe(2);
  });
});

describe.skipIf(!HAVE_ENGINE)("learn technique-page baked samples", () => {
  it("xy-wing sample: Diabolical via exactly one XY-Wing, nothing fishier", () => {
    const g = pageSample("learn-xy-wing.html");
    expect(g?.tier_label).toBe("diabolical");
    expect(g?.steps).toBe(56);
    expect(g?.technique_counts["XYWing"]).toBe(1);
    expect(
      (g?.technique_counts["SwordfishRow"] ?? 0) + (g?.technique_counts["SwordfishCol"] ?? 0),
    ).toBe(0);
  });

  it("swordfish sample: Diabolical via one Swordfish plus one XY-Wing", () => {
    const g = pageSample("learn-swordfish.html");
    expect(g?.tier_label).toBe("diabolical");
    expect(g?.steps).toBe(58);
    expect(
      (g?.technique_counts["SwordfishRow"] ?? 0) + (g?.technique_counts["SwordfishCol"] ?? 0),
    ).toBe(1);
    expect(g?.technique_counts["XYWing"]).toBe(1);
  });

  it("coloring sample: Nightmare via exactly one Coloring move, nothing harder", () => {
    const g = pageSample("learn-coloring.html");
    expect(g?.tier_label).toBe("nightmare");
    expect(g?.steps).toBe(57);
    expect(g?.technique_counts["Coloring"]).toBe(1);
    expect(g?.technique_counts["ForcingChain"] ?? 0).toBe(0);
    expect(g?.technique_counts["Als"] ?? 0).toBe(0);
  });

  it("forcing-chains sample: Nightmare via exactly one Forcing chain, nothing else advanced", () => {
    const g = pageSample("learn-forcing-chains.html");
    expect(g?.tier_label).toBe("nightmare");
    expect(g?.steps).toBe(58);
    expect(g?.technique_counts["ForcingChain"]).toBe(1);
    expect(g?.technique_counts["Coloring"] ?? 0).toBe(0);
    expect(g?.technique_counts["Als"] ?? 0).toBe(0);
    expect(g?.technique_counts["XYWing"] ?? 0).toBe(0);
    expect(
      (g?.technique_counts["SwordfishRow"] ?? 0) + (g?.technique_counts["SwordfishCol"] ?? 0),
    ).toBe(0);
  });
});
