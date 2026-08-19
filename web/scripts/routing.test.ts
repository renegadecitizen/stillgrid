/**
 * Replaces the old `landing-routes.test.ts`.
 *
 * The Express route table was code, so it could be unit-tested directly. It is
 * now static host config (`public/_redirects`), which nothing typechecks — a
 * typo there is a 404 in production and nowhere else. These tests read the
 * actual file and check that every URL the site publishes still resolves to a
 * file that exists.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const WEB = process.cwd();
const redirects = readFileSync(resolve(WEB, "public/_redirects"), "utf8");
const headers = readFileSync(resolve(WEB, "public/_headers"), "utf8");

/** Parse `_redirects` into [from, to, status] triples, ignoring comments. */
function rules(): Array<[string, string, string]> {
  return redirects
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((l) => l.split(/\s+/) as [string, string, string]);
}

describe("_redirects", () => {
  it("rewrites every /learn/* URL to a file that exists", () => {
    const learn = rules().filter(([from]) => from.startsWith("/learn/"));
    expect(learn.length).toBe(7);

    for (const [from, to, status] of learn) {
      // 200 = rewrite. A 301 here would change the URL crawlers already
      // indexed, which is the whole reason these are rewrites.
      expect(status, `${from} should be a rewrite, not a redirect`).toBe("200");
      const file = resolve(WEB, "public", to.replace(/^\//, ""));
      const built = resolve(WEB, to.replace(/^\//, ""));
      expect(
        existsSync(file) || existsSync(built),
        `${from} → ${to}, but ${to} does not exist`,
      ).toBe(true);
    }
  });

  it("covers exactly the learn subpages the old server routed", () => {
    const froms = rules()
      .map(([from]) => from)
      .filter((f) => f.startsWith("/learn/"));
    expect(froms.sort()).toEqual(
      [
        "/learn/advanced",
        "/learn/coloring",
        "/learn/core",
        "/learn/forcing-chains",
        "/learn/swordfish",
        "/learn/variants",
        "/learn/xy-wing",
      ].sort(),
    );
  });

  it("retires the API with a 410 rather than a soft 404", () => {
    const api = rules().find(([from]) => from.startsWith("/api"));
    expect(api?.[2]).toBe("410");
  });
});

describe("landing pages", () => {
  // These resolve by filename on the host, so there is no rule to check —
  // only that the files are actually there.
  const LANDING = [
    "classic",
    "killer",
    "jigsaw",
    "xsudoku",
    "sudoku-16x16",
    "privacy",
    "evil-sudoku",
  ];

  it("all exist as prerendered HTML in public/", () => {
    for (const slug of LANDING) {
      expect(existsSync(resolve(WEB, `public/${slug}.html`)), `${slug}.html missing`).toBe(
        true,
      );
    }
  });

  it("the Vite-built tool pages exist as entry HTML", () => {
    for (const slug of ["learn", "grade", "killer-sudoku-calculator"]) {
      expect(existsSync(resolve(WEB, `${slug}.html`)), `${slug}.html missing`).toBe(true);
    }
  });

  it("has a 404 page for the host to fall back to", () => {
    expect(existsSync(resolve(WEB, "public/404.html"))).toBe(true);
  });
});

describe("_headers", () => {
  it("caches hashed assets immutably", () => {
    expect(headers).toMatch(/\/assets\/\*/);
    expect(headers).toMatch(/immutable/);
  });

  it("keeps the service worker uncacheable", () => {
    // A pinned service worker would serve stale assets indefinitely, including
    // a stale engine.
    const swBlock = headers.slice(headers.indexOf("/sw.js"));
    expect(swBlock).toMatch(/no-store/);
  });
});
