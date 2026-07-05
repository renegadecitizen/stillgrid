import { describe, it, expect, vi, beforeEach } from "vitest";

type UmamiWindow = { umami?: { track: unknown } };

describe("analytics.track()", () => {
  beforeEach(() => {
    delete (window as UmamiWindow).umami;
    vi.resetModules();
    (import.meta.env as Record<string, unknown>).PROD = false;
  });

  it("no-ops in dev (PROD=false) even if window.umami exists", async () => {
    (import.meta.env as Record<string, unknown>).PROD = false;
    const trackSpy = vi.fn();
    (window as UmamiWindow).umami = { track: trackSpy };
    const { track } = await import("./analytics");

    track("first_visit_ever");

    expect(trackSpy).not.toHaveBeenCalled();
  });

  describe("in production (PROD=true)", () => {
    beforeEach(() => {
      (import.meta.env as Record<string, unknown>).PROD = true;
    });

    it("no-ops when window.umami is undefined", async () => {
      const { track } = await import("./analytics");
      expect(() =>
        track("puzzle_started", { variant: "classic", tier: "easy", is_daily: false }),
      ).not.toThrow();
    });

    it("calls umami.track with event name and flat props", async () => {
      const trackSpy = vi.fn();
      (window as UmamiWindow).umami = { track: trackSpy };
      const { track } = await import("./analytics");

      track("puzzle_completed", {
        variant: "classic",
        tier: "easy",
        is_daily: false,
        duration_seconds: 120,
      });

      expect(trackSpy).toHaveBeenCalledWith("puzzle_completed", {
        variant: "classic",
        tier: "easy",
        is_daily: false,
        duration_seconds: 120,
      });
    });

    it("calls umami.track with undefined data when no props passed", async () => {
      const trackSpy = vi.fn();
      (window as UmamiWindow).umami = { track: trackSpy };
      const { track } = await import("./analytics");

      track("first_visit_ever");

      expect(trackSpy).toHaveBeenCalledWith("first_visit_ever", undefined);
    });

    it("forwards puzzle_shared props", async () => {
      const trackSpy = vi.fn();
      (window as UmamiWindow).umami = { track: trackSpy };
      const { track } = await import("./analytics");

      track("puzzle_shared", {
        variant: "killer",
        size: 9,
        tier: "medium",
        is_daily: true,
        method: "clipboard",
      });

      expect(trackSpy).toHaveBeenCalledWith("puzzle_shared", {
        variant: "killer",
        size: 9,
        tier: "medium",
        is_daily: true,
        method: "clipboard",
      });
    });
  });
});
