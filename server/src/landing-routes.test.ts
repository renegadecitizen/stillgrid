import { describe, it, expect } from "vitest";
import { LANDING_ROUTES, canonicalTrailingSlash } from "./index.js";

describe("LANDING_ROUTES", () => {
  it("includes the learn page so /learn resolves to a prerendered file", () => {
    expect(LANDING_ROUTES).toContain("learn");
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
