import { describe, it, expect } from "vitest";
import { LANDING_ROUTES, LEARN_SUBPAGES, canonicalTrailingSlash } from "./index.js";

describe("LANDING_ROUTES", () => {
  it("includes the learn page so /learn resolves to a prerendered file", () => {
    expect(LANDING_ROUTES).toContain("learn");
  });
});

describe("LEARN_SUBPAGES", () => {
  it("maps the three nested learn routes to their html files", () => {
    expect(Object.keys(LEARN_SUBPAGES)).toEqual(["/learn/core", "/learn/advanced", "/learn/variants"]);
    expect(LEARN_SUBPAGES["/learn/core"]).toBe("learn-core.html");
    expect(LEARN_SUBPAGES["/learn/advanced"]).toBe("learn-advanced.html");
    expect(LEARN_SUBPAGES["/learn/variants"]).toBe("learn-variants.html");
  });
});

describe("canonicalTrailingSlash", () => {
  it("strips a trailing slash", () => {
    expect(canonicalTrailingSlash("/learn/")).toBe("/learn");
  });
  it("leaves slashless paths alone", () => {
    expect(canonicalTrailingSlash("/learn")).toBeNull();
  });
  it("leaves root alone", () => {
    expect(canonicalTrailingSlash("/")).toBeNull();
  });
});
