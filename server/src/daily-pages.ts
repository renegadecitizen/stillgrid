// Server-rendered /daily archive pages. Pure functions only — data fetching
// (engine spawns + cache) stays in index.ts so everything here unit-tests
// without binaries.

import type { GeneratedPuzzle, Grade } from "./engine.js";

export const ORIGIN = "https://stillgrid.app";

// Backfill window start: 60 days before launch (2026-07-07), per the growth
// plan's indexation cap. Extend only after GSC proves the wave indexes.
export const ARCHIVE_START = "2026-05-08";

export type DailyKind = "classic" | "killer";
export const DAILY_KINDS = ["classic", "killer"] as const;

export function isDailyKind(s: string): s is DailyKind {
  return (DAILY_KINDS as readonly string[]).includes(s);
}

export interface DailyPuzzle extends GeneratedPuzzle {
  grade: Grade;
}

export interface DailyData {
  date: string;
  classic: DailyPuzzle;
  killer: DailyPuzzle;
}

// --- dates ------------------------------------------------------------------

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Real calendar date (round-trips through Date at UTC) inside the archive
// window. String comparison is safe for ISO dates.
export function isValidDailyDate(date: string, today: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return false;
  return date >= ARCHIVE_START && date <= today;
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Newest first: today back to ARCHIVE_START. Forward-growing — two new URLs
// appear each day with no deploy.
export function archiveDates(today: string): string[] {
  const out: string[] = [];
  let d = today;
  while (d >= ARCHIVE_START) {
    out.push(d);
    d = shiftDate(d, -1);
  }
  return out;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2026-07-07" → "July 7, 2026". Parsed by hand to avoid timezone drift.
export function prettyDate(iso: string): string {
  const m = ISO_DATE.exec(iso) ? iso.split("-") : null;
  if (!m) return iso;
  return `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}, ${m[0]}`;
}

// --- technique ladder -------------------------------------------------------

export interface TechFamily {
  label: string;
  keys: readonly string[];
  tier: 1 | 2 | 3 | 4 | 5;
  href: string;
}

// Grader technique_counts keys grouped into display families, in ladder order.
// Keys mirror technique_name() in engine/src/bin/stillgrid-grade.rs; the same
// table exists client-side in web/src/grade/ladder.ts — keep them in sync.
export const TECH_FAMILIES: readonly TechFamily[] = [
  { label: "Naked single", keys: ["NakedSingle"], tier: 1, href: "/learn#naked-single" },
  {
    label: "Hidden single",
    keys: ["HiddenSingleRow", "HiddenSingleCol", "HiddenSingleBox", "HiddenSingleDiag", "HiddenSingleCage"],
    tier: 1,
    href: "/learn#hidden-single",
  },
  {
    label: "Naked pair",
    keys: ["NakedPairRow", "NakedPairCol", "NakedPairBox", "NakedPairDiag", "NakedPairCage"],
    tier: 2,
    href: "/learn/core#naked-pair",
  },
  {
    label: "Hidden pair",
    keys: ["HiddenPairRow", "HiddenPairCol", "HiddenPairBox", "HiddenPairDiag", "HiddenPairCage"],
    tier: 2,
    href: "/learn/core#hidden-pair",
  },
  { label: "Pointing pair", keys: ["PointingPair"], tier: 2, href: "/learn/core#pointing-pair" },
  { label: "Cage combinations", keys: ["CageCombo"], tier: 2, href: "/killer-sudoku-calculator" },
  { label: "X-Wing", keys: ["XWingRow", "XWingCol"], tier: 3, href: "/learn/advanced#x-wing" },
  { label: "Swordfish", keys: ["SwordfishRow", "SwordfishCol"], tier: 4, href: "/learn/advanced#swordfish" },
  { label: "XY-Wing", keys: ["XYWing"], tier: 4, href: "/learn/advanced#swordfish" },
  { label: "Coloring", keys: ["Coloring"], tier: 5, href: "/learn/advanced#swordfish" },
  { label: "Forcing chain", keys: ["ForcingChain"], tier: 5, href: "/learn/advanced#swordfish" },
  { label: "Almost Locked Set", keys: ["Als"], tier: 5, href: "/learn/advanced#swordfish" },
];

export interface TechLine {
  label: string;
  count: number;
  tier: number;
  href: string;
}

// Aggregate raw counts into families, ladder order. Unknown keys (a future
// technique the table hasn't caught up with) still render, unlinked.
export function techniqueBreakdown(counts: Record<string, number>): TechLine[] {
  const out: TechLine[] = [];
  const seen = new Set<string>();
  for (const fam of TECH_FAMILIES) {
    let n = 0;
    for (const k of fam.keys) {
      seen.add(k);
      n += counts[k] ?? 0;
    }
    if (n > 0) out.push({ label: fam.label, count: n, tier: fam.tier, href: fam.href });
  }
  for (const [k, n] of Object.entries(counts)) {
    if (!seen.has(k) && n > 0) out.push({ label: k, count: n, tier: 5, href: "" });
  }
  return out;
}

export const TIER_NAMES: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  diabolical: "Diabolical",
  nightmare: "Nightmare",
};

// --- grid rendering ---------------------------------------------------------

// Static 9×9 givens grid as a table. Borders are drawn per-cell (top + left
// only; the table's own border closes the frame) so dashed cage edges never
// fight solid grid lines under border-collapse's conflict rules.
export function renderGrid(p: GeneratedPuzzle, ariaLabel: string): string {
  const n = 9;
  const givens = p.givens;
  const cageOf = new Array<number>(n * n).fill(-1);
  const sumAt = new Map<number, number>();
  (p.cages ?? []).forEach((cage, ci) => {
    for (const cell of cage.cells) cageOf[cell] = ci;
    sumAt.set(Math.min(...cage.cells), cage.sum);
  });
  const rows: string[] = [];
  for (let r = 0; r < n; r++) {
    const cells: string[] = [];
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const classes: string[] = [];
      if (r > 0) {
        if (r % 3 === 0) classes.push("bt");
        else if (cageOf[i] !== -1 && cageOf[i] !== cageOf[i - n]) classes.push("ct");
      }
      if (c > 0) {
        if (c % 3 === 0) classes.push("bl");
        else if (cageOf[i] !== -1 && cageOf[i] !== cageOf[i - 1]) classes.push("cl");
      }
      const ch = givens[i] ?? ".";
      const digit = ch >= "1" && ch <= "9" ? ch : "";
      if (digit) classes.push("g");
      const sum = sumAt.get(i);
      const sumSpan = sum !== undefined ? `<span class="s">${sum}</span>` : "";
      const cls = classes.length ? ` class="${classes.join(" ")}"` : "";
      cells.push(`<td${cls}>${sumSpan}${digit}</td>`);
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table class="board" role="img" aria-label="${ariaLabel}"><tbody>${rows.join("")}</tbody></table>`;
}

// --- shared page chrome -----------------------------------------------------

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" />
    <link rel="stylesheet" href="/landing.css" />
    <!-- Privacy-friendly analytics by Umami -->
    <script defer src="https://cloud.umami.is/script.js" data-website-id="a623ea5c-9c7e-45c2-9d15-6c56bdfe0593"></script>`;

// Board + technique-list styles are inlined so the pages stay self-contained;
// tier colors mirror web/src/index.css.
const DAILY_CSS = `<style>
:root { --accent: var(--color-sage); }
.board { border-collapse: separate; border-spacing: 0; border: 2px solid var(--color-ink); margin: 1.5rem auto; }
.board td { position: relative; width: 44px; height: 44px; padding: 0; text-align: center; vertical-align: middle;
  font-family: "Fraunces", Georgia, serif; font-size: 1.3rem; color: var(--color-ink);
  border-top: 1px solid var(--color-border); border-left: 1px solid var(--color-border); }
.board tr:first-child td { border-top: none; }
.board td:first-child { border-left: none; }
.board td.bt { border-top: 2px solid var(--color-ink); }
.board td.bl { border-left: 2px solid var(--color-ink); }
.board td.ct { border-top: 1px dashed var(--color-terracotta); }
.board td.cl { border-left: 1px dashed var(--color-terracotta); }
.board td .s { position: absolute; top: 1px; left: 3px; font-family: "Inter", sans-serif; font-size: 0.6rem; color: var(--color-ink-soft); }
@media (max-width: 480px) { .board td { width: 34px; height: 34px; font-size: 1.05rem; } .board td .s { font-size: 0.5rem; } }
.tier-badge { display: inline-block; padding: 0.2rem 0.75rem; border-radius: 999px; font-weight: 600; font-size: 0.95rem; }
.tier-easy { background: #e6ede7; color: #3d5a4e; }
.tier-medium { background: #faf0db; color: #97681e; }
.tier-hard { background: #fbe7dd; color: #a14a2a; }
.tier-diabolical { background: #f3e3ec; color: #8c4a6b; }
.tier-nightmare { background: #e7e6f1; color: #3f3a5e; }
.tech-list { list-style: none; padding: 0; }
.tech-list li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.45rem 0; border-bottom: 1px solid var(--color-border); max-width: 430px; margin: 0 auto; }
.tech-list .n { color: var(--color-ink-soft); font-variant-numeric: tabular-nums; }
.day-nav { display: flex; justify-content: space-between; gap: 1rem; margin: 2rem 0 0; font-size: 0.95rem; }
.puzzle-meta { text-align: center; color: var(--color-ink-soft); font-size: 0.9rem; margin-top: -0.75rem; }
.archive-list { list-style: none; padding: 0; }
.archive-list li { padding: 0.4rem 0; border-bottom: 1px solid var(--color-border); display: flex; flex-wrap: wrap; gap: 0.35rem 1rem; justify-content: space-between; }
.archive-list .d { min-width: 9rem; }
</style>`;

function pageShell(opts: {
  title: string;
  description: string;
  canonicalPath: string;
  jsonLd: string[];
  body: string;
}): string {
  const ld = opts.jsonLd
    .map((j) => `<script type="application/ld+json">\n    ${j}\n    </script>`)
    .join("\n    ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#FAF7F2" />
    <title>${opts.title}</title>
    <meta name="description" content="${opts.description}" />
    <link rel="canonical" href="${ORIGIN}${opts.canonicalPath}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta property="og:title" content="${opts.title}" />
    <meta property="og:description" content="${opts.description}" />
    <meta property="og:url" content="${ORIGIN}${opts.canonicalPath}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${ORIGIN}/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Stillgrid — sudoku, the quiet way." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${ORIGIN}/og-image.png" />
    ${FONTS}
    ${DAILY_CSS}
    ${ld}
  </head>
  <body>
    <main>
      <a class="brand" href="/">Stillgrid</a>
${opts.body}
      <footer>
        <a href="/">Stillgrid home</a> · <a href="/daily">Daily archive</a> · sudoku, the quiet way
      </footer>
    </main>
  </body>
</html>
`;
}

const VARIANT_ROW = `<h2>Keep playing</h2>
      <div class="variant-row">
        <a href="/classic">Classic Sudoku</a>
        <a href="/killer">Killer Sudoku</a>
        <a href="/jigsaw">Jigsaw Sudoku</a>
        <a href="/xsudoku">X-Sudoku</a>
        <a href="/sudoku-16x16">16×16 Sudoku</a>
        <a href="/killer-sudoku-calculator">Killer Sudoku Calculator</a>
        <a href="/learn">Learn how to play</a>
      </div>`;

// --- per-date page ----------------------------------------------------------

const KIND_LABEL: Record<DailyKind, string> = { classic: "Classic", killer: "Killer" };

export function renderDailyPage(kind: DailyKind, data: DailyData, today: string): string {
  const date = data.date;
  const p = data[kind];
  const pretty = prettyDate(date);
  const label = KIND_LABEL[kind];
  const grade = p.grade;
  const solved = grade.outcome === "solved";
  const tierLabel = solved ? TIER_NAMES[grade.tier_label] ?? grade.tier_label : null;
  const lines = solved ? techniqueBreakdown(grade.technique_counts) : [];

  const metaBits =
    kind === "killer"
      ? `${p.cages?.length ?? 0} cages, ${p.clue_count} given${p.clue_count === 1 ? "" : "s"}`
      : `${p.clue_count} clues`;
  const topFamilies = lines
    .slice()
    .sort((a, b) => b.tier - a.tier || b.count - a.count)
    .slice(0, 2)
    .map((l) => l.label.toLowerCase());
  const description = solved
    ? `The daily ${label.toLowerCase()} sudoku for ${pretty}: ${tierLabel}, ${metaBits} — solvable with ${topFamilies.join(" and ")}. Same puzzle for everyone. Play it free.`
    : `The daily ${label.toLowerCase()} sudoku for ${pretty}: ${metaBits}. Same puzzle for everyone. Play it free.`;

  const techHtml = solved
    ? `<p>Our grader solved this puzzle in ${grade.steps} steps. Every technique it needed, in ladder order:</p>
      <ul class="tech-list">
        ${lines
          .map(
            (l) =>
              `<li><span>${l.href ? `<a href="${l.href}">${l.label}</a>` : l.label}</span><span class="n">× ${l.count}</span></li>`,
          )
          .join("\n        ")}
      </ul>
      <p>Difficulty on Stillgrid is graded by the hardest technique a puzzle actually requires — this one earns <strong>${tierLabel}</strong>. <a href="/learn">How the technique ladder works</a>.</p>`
    : `<p>Our grader couldn't finish this one with its full technique ladder — genuinely beyond Nightmare. <a href="/learn">About the technique ladder</a>.</p>`;

  const prev = shiftDate(date, -1);
  const next = shiftDate(date, 1);
  const prevLink =
    prev >= ARCHIVE_START ? `<a href="/daily/${kind}/${prev}" rel="prev">← ${prettyDate(prev)}</a>` : "<span></span>";
  const nextLink =
    next <= today ? `<a href="/daily/${kind}/${next}" rel="next">${prettyDate(next)} →</a>` : "<span></span>";
  const otherKind: DailyKind = kind === "classic" ? "killer" : "classic";

  const jsonLd = [
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Game",
      name: `Daily ${label} Sudoku — ${pretty}`,
      description,
      genre: "Puzzle",
      gamePlatform: "Web",
      url: `${ORIGIN}/daily/${kind}/${date}`,
      datePublished: date,
      inLanguage: "en",
      isAccessibleForFree: true,
      publisher: { "@type": "Organization", name: "Stillgrid", url: ORIGIN },
    }),
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Stillgrid", item: ORIGIN },
        { "@type": "ListItem", position: 2, name: "Daily archive", item: `${ORIGIN}/daily` },
        { "@type": "ListItem", position: 3, name: `Daily ${label} — ${pretty}` },
      ],
    }),
  ];

  const gridAria = solved
    ? `Starting grid of the daily ${label.toLowerCase()} sudoku for ${pretty}: ${metaBits}, graded ${tierLabel}.`
    : `Starting grid of the daily ${label.toLowerCase()} sudoku for ${pretty}: ${metaBits}.`;

  const killerHint =
    kind === "killer"
      ? `\n      <p>Stuck on a cage? The <a href="/killer-sudoku-calculator">killer sudoku calculator</a> lists every combination a sum can take.</p>`
      : "";

  const body = `      <h1>Daily ${label} Sudoku <span aria-hidden="true">·</span> ${pretty}</h1>
      <p class="lede">The same puzzle everyone got on ${pretty} — deterministic, graded, and still playable.</p>
      <p style="text-align:center"><a class="cta" href="/?d=${kind}&amp;date=${date}">Play this daily</a></p>
      ${renderGrid(p, gridAria)}
      <p class="puzzle-meta">${metaBits}${solved ? ` · <span class="tier-badge tier-${grade.tier_label}">${tierLabel}</span>` : ""}</p>

      <h2>What it takes to solve</h2>
      ${techHtml}${killerHint}

      <p>Also on ${pretty}: the <a href="/daily/${otherKind}/${date}">daily ${KIND_LABEL[otherKind].toLowerCase()}</a>.${date !== today ? ` Or jump to <a href="/?d=${kind}">today's ${label.toLowerCase()} daily</a>.` : ""}</p>

      <nav class="day-nav" aria-label="Adjacent days">
        ${prevLink}
        <a href="/daily">Full archive</a>
        ${nextLink}
      </nav>

      ${VARIANT_ROW}`;

  return pageShell({
    title: `Daily ${label} Sudoku — ${pretty} | Stillgrid`,
    description,
    canonicalPath: `/daily/${kind}/${date}`,
    jsonLd,
    body,
  });
}

// --- archive index ----------------------------------------------------------

export function renderArchiveIndex(today: string): string {
  const dates = archiveDates(today);
  const byMonth = new Map<string, string[]>();
  for (const d of dates) {
    const key = d.slice(0, 7);
    const list = byMonth.get(key);
    if (list) list.push(d);
    else byMonth.set(key, [d]);
  }

  const sections = [...byMonth.entries()]
    .map(([month, ds]) => {
      const [y, m] = month.split("-");
      const items = ds
        .map((d) => {
          const dayLabel = `${MONTHS[Number(m) - 1]} ${Number(d.slice(8))}`;
          const todayTag = d === today ? " <em>(today)</em>" : "";
          return `<li><span class="d">${dayLabel}${todayTag}</span><span><a href="/daily/classic/${d}">Classic</a> · <a href="/daily/killer/${d}">Killer</a></span></li>`;
        })
        .join("\n        ");
      return `<h2>${MONTHS[Number(m) - 1]} ${y}</h2>
      <ul class="archive-list">
        ${items}
      </ul>`;
    })
    .join("\n      ");

  const description =
    "Every Stillgrid daily sudoku since May 2026 — one classic and one killer per day, the same puzzle for everyone, each graded by the techniques it actually requires. All still playable, free.";

  const faq = [
    {
      q: "What is the Stillgrid daily sudoku?",
      a: "Every day Stillgrid publishes two daily puzzles — one classic sudoku and one killer sudoku. The daily is deterministic: everyone in the world gets the same puzzle on the same date, so times and streaks are comparable.",
    },
    {
      q: "Can I still play a daily I missed?",
      a: "Yes. Every daily in this archive is fully playable — open its page and press Play. Each archive page also shows the puzzle's difficulty grade and the exact solving techniques it requires.",
    },
    {
      q: "Are the daily puzzles free?",
      a: "Yes. Every daily — today's and the whole archive — is free to play, with no signup needed to start a puzzle.",
    },
  ];

  const jsonLd = [
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Daily Sudoku Archive — Stillgrid",
      description,
      url: `${ORIGIN}/daily`,
      inLanguage: "en",
      isAccessibleForFree: true,
      publisher: { "@type": "Organization", name: "Stillgrid", url: ORIGIN },
    }),
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    }),
  ];

  const faqHtml = faq.map((f) => `<h3>${f.q}</h3>\n        <p>${f.a}</p>`).join("\n        ");

  const body = `      <h1>Daily Sudoku Archive</h1>
      <p class="lede">One classic and one killer every day — the same puzzle for everyone, graded by the techniques it actually needs. Miss a day? It's all here.</p>
      <p><a class="cta" href="/?d=classic">Play today's daily</a></p>
      <p>Each page below shows the starting grid, the honest difficulty grade, and the exact technique ladder our grader used — then lets you play that day's puzzle.</p>

      ${sections}

      <h2>Common questions</h2>
      <div class="faq">
        ${faqHtml}
      </div>

      ${VARIANT_ROW}`;

  return pageShell({
    title: "Daily Sudoku Archive — every day's classic & killer | Stillgrid",
    description,
    canonicalPath: "/daily",
    jsonLd,
    body,
  });
}

// --- sitemap ----------------------------------------------------------------

// Inject the /daily index + every archive date into the static sitemap. The
// static file (web/public/sitemap.xml) stays the editable source of truth for
// hand-maintained pages; daily URLs grow forward without a deploy.
export function mergeDailyIntoSitemap(staticXml: string, today: string): string {
  const urls: string[] = [
    `  <url>\n    <loc>${ORIGIN}/daily</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`,
  ];
  for (const d of archiveDates(today)) {
    for (const kind of DAILY_KINDS) {
      urls.push(
        `  <url>\n    <loc>${ORIGIN}/daily/${kind}/${d}</loc>\n    <lastmod>${d}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.4</priority>\n  </url>`,
      );
    }
  }
  return staticXml.replace("</urlset>", `${urls.join("\n")}\n</urlset>`);
}
