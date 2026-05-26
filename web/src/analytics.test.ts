import { describe, it, expect, vi, beforeEach } from "vitest";

describe("analytics.track()", () => {
  beforeEach(() => {
    delete (window as { plausible?: unknown }).plausible;
    vi.resetModules();
    (import.meta.env as Record<string, unknown>).PROD = false;
  });

  it("no-ops in dev (PROD=false) even if window.plausible exists", async () => {
    (import.meta.env as Record<string, unknown>).PROD = false;
    const plausibleSpy = vi.fn();
    (window as { plausible?: unknown }).plausible = plausibleSpy;
    const { track } = await import("./analytics");

    track("first_visit_ever");

    expect(plausibleSpy).not.toHaveBeenCalled();
  });

  describe("in production (PROD=true)", () => {
    beforeEach(() => {
      (import.meta.env as Record<string, unknown>).PROD = true;
    });

    it("no-ops when window.plausible is undefined", async () => {
      const { track } = await import("./analytics");
      expect(() =>
        track("puzzle_started", { variant: "classic", tier: "easy", is_daily: false }),
      ).not.toThrow();
    });

    it("calls window.plausible with event name and props", async () => {
      const plausibleSpy = vi.fn();
      (window as { plausible?: unknown }).plausible = plausibleSpy;
      const { track } = await import("./analytics");

      track("puzzle_completed", {
        variant: "classic",
        tier: "easy",
        is_daily: false,
        duration_seconds: 120,
      });

      expect(plausibleSpy).toHaveBeenCalledWith("puzzle_completed", {
        props: { variant: "classic", tier: "easy", is_daily: false, duration_seconds: 120 },
      });
    });

    it("calls window.plausible with no opts when no props passed", async () => {
      const plausibleSpy = vi.fn();
      (window as { plausible?: unknown }).plausible = plausibleSpy;
      const { track } = await import("./analytics");

      track("first_visit_ever");

      expect(plausibleSpy).toHaveBeenCalledWith("first_visit_ever", undefined);
    });
  });
});
