import { describe, it, expect } from "vitest";
import { buildShareText, parseEntryParam } from "./share";

const ORIGIN = "https://stillgrid.app";

describe("buildShareText", () => {
  it("formats a daily Killer (Medium) solve", () => {
    const r = buildShareText({
      variant: "killer", size: 9, tier: "medium", timeSec: 252,
      mistakes: 0, streak: 7, isDaily: true, date: "2026-06-18", origin: ORIGIN,
    });
    expect(r.body).toBe("🟧 Stillgrid Daily · Killer · Jun 18\n🟩🟩⬜⬜⬜ Medium · 4:12 · no mistakes · 🔥7");
    expect(r.url).toBe("https://stillgrid.app/?d=killer");
    expect(r.full).toBe(r.body + "\n" + r.url);
  });

  it("formats a casual Jigsaw (Nightmare) solve", () => {
    const r = buildShareText({
      variant: "jigsaw", size: 9, tier: "nightmare", timeSec: 252,
      mistakes: 0, streak: 3, isDaily: false, date: "", origin: ORIGIN,
    });
    expect(r.body).toBe("🟪 Stillgrid · Jigsaw\n🟩🟩🟩🟩🟩 Nightmare · 4:12 · no mistakes · 🔥3");
    expect(r.url).toBe("https://stillgrid.app/?v=jigsaw");
  });

  it("uses the variant square for each variant", () => {
    const sq = (variant: "classic" | "xsudoku" | "jigsaw" | "killer") =>
      [...buildShareText({ variant, size: 9, tier: "easy", timeSec: 60, mistakes: 0, streak: 0, isDaily: false, date: "", origin: ORIGIN }).body][0];
    expect(sq("classic")).toBe("🟩");
    expect(sq("xsudoku")).toBe("🟦");
    expect(sq("killer")).toBe("🟧");
    expect(sq("jigsaw")).toBe("🟪");
  });

  it("maps each tier to the right pip row + name", () => {
    const line2 = (tier: string) =>
      buildShareText({ variant: "classic", size: 9, tier, timeSec: 60, mistakes: 0, streak: 0, isDaily: false, date: "", origin: ORIGIN }).body.split("\n")[1];
    expect(line2("easy")).toBe("🟩⬜⬜⬜⬜ Easy · 1:00 · no mistakes");
    expect(line2("medium")).toBe("🟩🟩⬜⬜⬜ Medium · 1:00 · no mistakes");
    expect(line2("hard")).toBe("🟩🟩🟩⬜⬜ Hard · 1:00 · no mistakes");
    expect(line2("diabolical")).toBe("🟩🟩🟩🟩⬜ Diabolical · 1:00 · no mistakes");
    expect(line2("nightmare")).toBe("🟩🟩🟩🟩🟩 Nightmare · 1:00 · no mistakes");
  });

  it("treats an unknown/stuck tier as easy", () => {
    const r = buildShareText({ variant: "classic", size: 9, tier: "stuck", timeSec: 60, mistakes: 0, streak: 0, isDaily: false, date: "", origin: ORIGIN });
    expect(r.body.split("\n")[1]).toBe("🟩⬜⬜⬜⬜ Easy · 1:00 · no mistakes");
  });

  it("adds a size suffix only when size != 9", () => {
    const label = (size: number) =>
      buildShareText({ variant: "classic", size, tier: "easy", timeSec: 60, mistakes: 0, streak: 0, isDaily: false, date: "", origin: ORIGIN }).body.split("\n")[0];
    expect(label(9)).toBe("🟩 Stillgrid · Classic");
    expect(label(6)).toBe("🟩 Stillgrid · Classic 6×6");
    expect(label(16)).toBe("🟩 Stillgrid · Classic 16×16");
  });

  it("pluralizes mistakes and hides the streak below 2", () => {
    const line2 = (mistakes: number, streak: number) =>
      buildShareText({ variant: "classic", size: 9, tier: "easy", timeSec: 65, mistakes, streak, isDaily: false, date: "", origin: ORIGIN }).body.split("\n")[1];
    expect(line2(0, 0)).toBe("🟩⬜⬜⬜⬜ Easy · 1:05 · no mistakes");
    expect(line2(1, 1)).toBe("🟩⬜⬜⬜⬜ Easy · 1:05 · 1 mistake");
    expect(line2(2, 2)).toBe("🟩⬜⬜⬜⬜ Easy · 1:05 · 2 mistakes · 🔥2");
  });

  it("uses ?d= for daily and ?v= for casual", () => {
    expect(buildShareText({ variant: "classic", size: 9, tier: "easy", timeSec: 60, mistakes: 0, streak: 0, isDaily: true, date: "2026-06-18", origin: ORIGIN }).url).toBe("https://stillgrid.app/?d=classic");
    expect(buildShareText({ variant: "classic", size: 9, tier: "easy", timeSec: 60, mistakes: 0, streak: 0, isDaily: false, date: "", origin: ORIGIN }).url).toBe("https://stillgrid.app/?v=classic");
  });
});

describe("parseEntryParam", () => {
  it("parses a valid daily param", () => {
    expect(parseEntryParam("?d=classic")).toEqual({ mode: "daily", variant: "classic" });
    expect(parseEntryParam("?d=killer")).toEqual({ mode: "daily", variant: "killer" });
  });

  it("rejects a daily param for a variant with no daily", () => {
    expect(parseEntryParam("?d=jigsaw")).toBeNull();
    expect(parseEntryParam("?d=xsudoku")).toBeNull();
  });

  it("parses a valid casual param for every variant", () => {
    expect(parseEntryParam("?v=classic")).toEqual({ mode: "casual", variant: "classic" });
    expect(parseEntryParam("?v=xsudoku")).toEqual({ mode: "casual", variant: "xsudoku" });
    expect(parseEntryParam("?v=jigsaw")).toEqual({ mode: "casual", variant: "jigsaw" });
    expect(parseEntryParam("?v=killer")).toEqual({ mode: "casual", variant: "killer" });
  });

  it("prefers daily when both are present", () => {
    expect(parseEntryParam("?d=classic&v=jigsaw")).toEqual({ mode: "daily", variant: "classic" });
  });

  it("returns null for unknown/empty/garbage", () => {
    expect(parseEntryParam("?v=foo")).toBeNull();
    expect(parseEntryParam("?size=9")).toBeNull();
    expect(parseEntryParam("")).toBeNull();
    expect(parseEntryParam("?d=")).toBeNull();
  });
});
