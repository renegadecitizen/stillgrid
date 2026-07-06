import express from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { generate, grade, solve, type GradeInput, type GeneratedPuzzle } from "./engine.js";

const SUPPORTED_SIZES = new Set([6, 9, 16]);
// 16×16 is exposed only for classic + xsudoku (jigsaw/killer deferred — perf + cage UX).
const SIZE_16_VARIANTS: ReadonlySet<string> = new Set(["classic", "xsudoku"]);

export function variantSupportsSize(variant: string, size: number): boolean {
  if (size === 16) return SIZE_16_VARIANTS.has(variant);
  return size === 6 || size === 9;
}

export function parseSize(raw: string | undefined): number | null {
  if (raw === undefined) return 9;
  const n = Number(raw);
  return SUPPORTED_SIZES.has(n) ? n : null;
}

function puzzleToGradeInput(p: GeneratedPuzzle): GradeInput {
  return {
    givens: p.givens,
    variant: p.variant,
    box_of: p.box_of,
    cages: p.cages,
  };
}

const PORT = Number(process.env.PORT ?? 3001);

export function canonicalTrailingSlash(path: string): string | null {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : null;
}

const app = express();

// Canonicalize trailing slashes (e.g. /learn/ -> /learn) with a 301. Prevents
// duplicate URLs and fixes relative-asset resolution on Vite-built pages.
app.use((req, res, next) => {
  const canon = canonicalTrailingSlash(req.path);
  if (req.method === "GET" && canon !== null) {
    const query = req.originalUrl.slice(req.path.length);
    res.redirect(301, canon + query);
    return;
  }
  next();
});

app.use(express.json());

// In production, serve the built React SPA from /app/web/dist (set by the
// Dockerfile). In dev, Vite serves the SPA on :5173 and proxies /api here.
const WEB_DIST =
  process.env.STILLGRID_WEB_DIST ?? resolve(import.meta.dirname, "../../web/dist");
const SERVE_STATIC = existsSync(WEB_DIST);
if (SERVE_STATIC) {
  app.use(
    express.static(WEB_DIST, {
      // Hashed JS/CSS bundles are immutable; long cache.
      maxAge: "1y",
      setHeaders: (res, path) => {
        // Must always re-fetch: the SPA entry and the service worker (a stale SW
        // would pin old assets forever).
        if (path.endsWith("index.html") || path.endsWith("sw.js")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        } else if (path.endsWith(".webmanifest")) {
          res.setHeader("Cache-Control", "no-cache");
        } else if (path.endsWith(".xml") || path.endsWith(".txt")) {
          // sitemap.xml / robots.txt: short cache so edits reach crawlers within
          // the hour instead of being pinned for a year.
          res.setHeader("Cache-Control", "public, max-age=3600");
        }
      },
    }),
  );
}

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "stillgrid-server",
    version: "0.1.0",
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev",
  });
});

app.post("/api/solve", async (req, res) => {
  const puzzle = typeof req.body?.puzzle === "string" ? req.body.puzzle : null;
  if (!puzzle) {
    res.status(400).json({ error: "missing 'puzzle' string in body" });
    return;
  }
  try {
    res.json(await solve(puzzle));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "unknown" });
  }
});

// Phase 1: spawns the generator binary per request.
// Phase 2 will replace this with a Postgres-backed puzzle pool to keep
// generation off the request path entirely.
const VARIANTS: ReadonlySet<string> = new Set(["classic", "xsudoku", "jigsaw", "killer"]);

// Per-(variant,tier) clue floor at 9×9, from the engine sweep (2026-06-04):
// harder tiers carve fewer clues so the requested grade actually occurs, then
// the retry loop matches grade.tier_label. Only meaningful at 9×9 — 6×6 is
// single-difficulty and 16×16 clamps to the 47% floor regardless. Killer is
// absent: generate_killer ignores min_clues, so its tiers are matched by grade
// alone (never Easy; Medium is the bulk, Nightmare the rare hard ones).
const TIER_FLOORS: Record<string, Record<string, number>> = {
  classic: { easy: 32, medium: 28, nightmare: 22 },
  xsudoku: { easy: 32, medium: 26, nightmare: 24 },
  jigsaw: { easy: 32, medium: 28, nightmare: 26 },
};

function tierFloorFor(variant: string, size: number, tier: string): number | undefined {
  if (size !== 9) return undefined;
  return TIER_FLOORS[variant]?.[tier];
}

app.get("/api/puzzle", async (req, res) => {
  const variant = String(req.query.variant ?? "classic");
  if (!VARIANTS.has(variant)) {
    res.status(400).json({ error: "unknown variant", variant, supported: [...VARIANTS] });
    return;
  }
  const size = parseSize(req.query.size !== undefined ? String(req.query.size) : undefined);
  if (size === null) {
    res.status(400).json({ error: "unsupported size", supported: [6, 9, 16] });
    return;
  }
  if (!variantSupportsSize(variant, size)) {
    res.status(400).json({
      error: "unsupported size for variant",
      variant,
      size,
      supportedSizes: SIZE_16_VARIANTS.has(variant) ? [6, 9, 16] : [6, 9],
    });
    return;
  }
  const seed = req.query.seed ? Number(req.query.seed) : undefined;
  const wantTier = req.query.tier ? String(req.query.tier) : null;
  // Explicit ?minClues wins; otherwise derive the floor from the requested tier.
  const minClues = req.query.minClues
    ? Number(req.query.minClues)
    : wantTier
      ? tierFloorFor(variant, size, wantTier)
      : undefined;

  const MAX_RETRIES = wantTier ? 60 : 1;
  try {
    let lastPuzzle: Awaited<ReturnType<typeof generate>> | null = null;
    let lastGrade: Awaited<ReturnType<typeof grade>> | null = null;
    let matched = !wantTier;
    for (let i = 0; i < MAX_RETRIES; i++) {
      const puzzle = await generate({
        variant: variant as "classic" | "xsudoku" | "jigsaw" | "killer",
        size,
        minClues,
        seed: seed !== undefined ? seed + i : undefined,
      });
      lastPuzzle = puzzle;
      lastGrade = await grade(puzzleToGradeInput(puzzle));
      if (wantTier && lastGrade.outcome === "solved" && lastGrade.tier_label === wantTier) {
        matched = true;
        break;
      }
      if (!wantTier) break;
    }
    if (!lastPuzzle) {
      res.status(500).json({ error: "generator produced nothing" });
      return;
    }
    const body: Record<string, unknown> = { ...lastPuzzle };
    body.size = size;
    if (lastGrade) body.grade = lastGrade;
    if (wantTier && !matched) {
      body.requested_tier = wantTier;
      body.tier_matched = false;
      body.note = `Could not generate a '${wantTier}' puzzle in ${MAX_RETRIES} attempts. Phase 2 puzzle pool will fix.`;
    }
    res.json(body);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "unknown" });
  }
});

app.post("/api/grade", async (req, res) => {
  const puzzle = typeof req.body?.puzzle === "string" ? req.body.puzzle : null;
  if (!puzzle) {
    res.status(400).json({ error: "missing 'puzzle' string in body" });
    return;
  }
  try {
    res.json(await grade(puzzle));
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "unknown" });
  }
});

// Deterministic daily challenge: same date → same two puzzles for everyone.
// Phase 2 will move this to a pre-generated Postgres pool keyed by date.
function dailySeed(date: string, kind: "classic" | "killer"): number {
  // YYYY-MM-DD → bigint-ish seed. Adding a per-kind salt so classic + killer
  // diverge.
  const [y, m, d] = date.split("-").map(Number);
  const base = (y! * 10000 + m! * 100 + d!) * 1000;
  return base + (kind === "classic" ? 1 : 2);
}

app.get("/api/daily", async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const date = String(req.query.date ?? today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  try {
    const [classic, killer] = await Promise.all([
      generate({ variant: "classic", seed: dailySeed(date, "classic"), minClues: 28 }),
      generate({ variant: "killer", seed: dailySeed(date, "killer") }),
    ]);
    const [g, gk] = await Promise.all([
      grade(puzzleToGradeInput(classic)),
      grade(puzzleToGradeInput(killer)),
    ]);
    res.json({
      date,
      classic: { ...classic, grade: g },
      killer: { ...killer, grade: gk },
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "unknown" });
  }
});

// Prerendered HTML pages for SEO. Must be registered before the 404 handler
// so /killer, /privacy, etc. resolve to their pages rather than the catch-all.
export const LANDING_ROUTES = ["classic", "killer", "jigsaw", "xsudoku", "sudoku-16x16", "privacy", "learn", "killer-sudoku-calculator"] as const;

export const LEARN_SUBPAGES = {
  "/learn/core": "learn-core.html",
  "/learn/advanced": "learn-advanced.html",
  "/learn/variants": "learn-variants.html",
} as const;
if (SERVE_STATIC) {
  for (const slug of LANDING_ROUTES) {
    app.get(`/${slug}`, (_req, res) => {
      res.sendFile(resolve(WEB_DIST, `${slug}.html`));
    });
  }

  for (const [path, file] of Object.entries(LEARN_SUBPAGES)) {
    app.get(path, (_req, res) => {
      res.sendFile(resolve(WEB_DIST, file));
    });
  }

  // The SPA lives only at /. There's no client-side router, so unknown paths
  // are real 404s — not routes to defer to the client.
  app.get("/", (_req, res) => {
    res.sendFile(resolve(WEB_DIST, "index.html"));
  });

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "not found", path: req.path });
      return;
    }
    res.status(404).sendFile(resolve(WEB_DIST, "404.html"));
  });
}

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(
      `stillgrid-server listening on :${PORT} (static: ${SERVE_STATIC ? WEB_DIST : "off"})`,
    );
  });
}
