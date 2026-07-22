import { describe, it, expect } from "vitest";
import { LANDING_ROUTES, LEARN_SUBPAGES, canonicalTrailingSlash } from "./index.js";

describe("LANDING_ROUTES", () => {
  it("includes the learn page so /learn resolves to a prerendered file", () => {
    expect(LANDING_ROUTES).toContain("learn");
  });
  it("includes the killer cage calculator", () => {
    expect(LANDING_ROUTES).toContain("killer-sudoku-calculator");
  });
});

describe("LEARN_SUBPAGES", () => {
  it("maps every nested learn route to its html file", () => {
    expect(Object.keys(LEARN_SUBPAGES)).toEqual([
      "/learn/core",
      "/learn/advanced",
      "/learn/variants",
      "/learn/xy-wing",
      "/learn/swordfish",
      "/learn/coloring",
      "/learn/forcing-chains",
    ]);
    expect(LEARN_SUBPAGES["/learn/core"]).toBe("learn-core.html");
    expect(LEARN_SUBPAGES["/learn/advanced"]).toBe("learn-advanced.html");
    expect(LEARN_SUBPAGES["/learn/variants"]).toBe("learn-variants.html");
    expect(LEARN_SUBPAGES["/learn/xy-wing"]).toBe("learn-xy-wing.html");
    expect(LEARN_SUBPAGES["/learn/swordfish"]).toBe("learn-swordfish.html");
    expect(LEARN_SUBPAGES["/learn/coloring"]).toBe("learn-coloring.html");
    expect(LEARN_SUBPAGES["/learn/forcing-chains"]).toBe("learn-forcing-chains.html");
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
