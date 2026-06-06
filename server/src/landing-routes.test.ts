import { describe, it, expect } from "vitest";
import { LANDING_ROUTES } from "./index.js";

describe("LANDING_ROUTES", () => {
  it("includes the learn page so /learn resolves to a prerendered file", () => {
    expect(LANDING_ROUTES).toContain("learn");
  });
});
