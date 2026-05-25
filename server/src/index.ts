import express from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { generate, grade, solve, type GradeInput, type GeneratedPuzzle } from "./engine.js";

function puzzleToGradeInput(p: GeneratedPuzzle): GradeInput {
  return {
    givens: p.givens,
    variant: p.variant,
    box_of: p.box_of,
    cages: p.cages,
  };
}

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
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
        if (path.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
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

app.get("/api/puzzle", async (req, res) => {
  const variant = String(req.query.variant ?? "classic");
  if (!VARIANTS.has(variant)) {
    res.status(400).json({ error: "unknown variant", variant, supported: [...VARIANTS] });
    return;
  }
  const minClues = req.query.minClues ? Number(req.query.minClues) : undefined;
  const seed = req.query.seed ? Number(req.query.seed) : undefined;
  const wantTier = req.query.tier ? String(req.query.tier) : null;

  const MAX_RETRIES = wantTier ? 60 : 1;
  try {
    let lastPuzzle: Awaited<ReturnType<typeof generate>> | null = null;
    let lastGrade: Awaited<ReturnType<typeof grade>> | null = null;
    let matched = !wantTier;
    for (let i = 0; i < MAX_RETRIES; i++) {
      const puzzle = await generate({
        variant: variant as "classic" | "xsudoku" | "jigsaw" | "killer",
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

// Variant landing pages — server-rendered (well, prerendered) HTML for SEO.
// These must be registered BEFORE the SPA fallback so /killer etc. resolve to
// the landing pages rather than the SPA shell.
const LANDING_ROUTES = ["classic", "killer", "jigsaw", "xsudoku"] as const;
if (SERVE_STATIC) {
  for (const slug of LANDING_ROUTES) {
    app.get(`/${slug}`, (_req, res) => {
      res.sendFile(resolve(WEB_DIST, `${slug}.html`));
    });
  }
}

// SPA fallback: any unknown GET serves index.html so client-side routes work.
if (SERVE_STATIC) {
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(resolve(WEB_DIST, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(
    `stillgrid-server listening on :${PORT} (static: ${SERVE_STATIC ? WEB_DIST : "off"})`,
  );
});
