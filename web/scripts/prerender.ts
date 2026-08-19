/**
 * Build-time renderer for everything the Express server used to compute
 * per-request.
 *
 * Emits into the Vite `dist/` tree, after `vite build` has run:
 *
 *   dist/daily/index.html              the archive index
 *   dist/daily/<kind>/<date>.html      one page per archived daily puzzle
 *   dist/sitemap.xml                   static sitemap + every archive URL
 *   dist/pool-16.json                  pre-generated 16×16 puzzles
 *
 * Daily puzzles are deterministic: the date seeds the generator, so the page
 * baked in here and the puzzle the browser generates for that date are the
 * same puzzle. That property is what makes a static build possible at all —
 * see `web/src/engine/api.ts`, which must keep the identical seed derivation.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  ARCHIVE_START,
  DAILY_KINDS,
  archiveDates,
  mergeDailyIntoSitemap,
  renderArchiveIndex,
  renderDailyPage,
  todayUTC,
  type DailyData,
  type DailyPuzzle,
} from "./daily-pages.js";
import { ENGINE_DIR, HAVE_ENGINE, generate, grade } from "./engine-cli.js";
// Shared with the browser engine — see the module docblock for why.
import { dailySeed } from "../src/engine/daily-seed.js";

// This file is bundled by esbuild before it runs, so `import.meta.url` points
// at the bundle rather than at this source file. Anchor on the working
// directory instead — npm scripts always run from the package root.
const WEB = process.env.STILLGRID_WEB_DIR ?? process.cwd();
const DIST = resolve(WEB, "dist");

function buildDaily(date: string): DailyData {
  const make = (kind: "classic" | "killer"): DailyPuzzle => {
    // min-clues 28 matches what the server passed; killer ignores it.
    const puzzle = generate({ variant: kind, seed: dailySeed(date, kind), minClues: 28 });
    // Classic grades from a bare string; killer needs its cages.
    const g =
      puzzle.variant === "classic"
        ? grade(puzzle.givens)
        : grade({ givens: puzzle.givens, variant: puzzle.variant, cages: puzzle.cages });
    return { ...puzzle, grade: g };
  };
  return { date, classic: make("classic"), killer: make("killer") };
}

function write(relPath: string, contents: string): void {
  const full = resolve(DIST, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

function main(): void {
  if (!HAVE_ENGINE) {
    throw new Error(
      `engine binaries not found in ${ENGINE_DIR} — run \`cargo build --release --bins\` in engine/ first`,
    );
  }
  if (!existsSync(DIST)) {
    throw new Error(`${DIST} does not exist — run \`vite build\` before prerendering`);
  }

  const today = todayUTC();
  const dates = archiveDates(today);
  console.log(`prerendering ${dates.length} daily dates (${ARCHIVE_START} → ${today})`);

  let pages = 0;
  for (const date of dates) {
    const data = buildDaily(date);
    for (const kind of DAILY_KINDS) {
      // Served at /daily/<kind>/<date>; the host resolves the extensionless
      // request to this file (see public/_redirects).
      write(`daily/${kind}/${date}.html`, renderDailyPage(kind, data, today));
      pages++;
    }
  }

  write("daily/index.html", renderArchiveIndex(today));
  console.log(`  wrote ${pages} daily pages + archive index`);

  // The server merged archive URLs into the sitemap on the fly; do it here.
  // Read the pristine source rather than dist/sitemap.xml so that re-running
  // the prerender without a fresh `vite build` can't merge the daily URLs in
  // twice.
  const staticSitemap = readFileSync(resolve(WEB, "public/sitemap.xml"), "utf8");
  write("sitemap.xml", mergeDailyIntoSitemap(staticSitemap, today));
  console.log("  merged daily URLs into sitemap.xml");

  // 16×16 puzzles take ~16s each to generate, so they ship as a pre-built pool
  // rather than being made on demand in the browser.
  const pool = resolve(WEB, "data/pool-16.json");
  if (existsSync(pool)) {
    copyFileSync(pool, resolve(DIST, "pool-16.json"));
    console.log("  copied 16×16 puzzle pool");
  } else {
    console.warn(`  WARNING: ${pool} missing — 16×16 puzzles will be unavailable`);
  }
}

main();
