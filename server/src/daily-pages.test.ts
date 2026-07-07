import { describe, it, expect } from "vitest";
import {
  ARCHIVE_START,
  archiveDates,
  isValidDailyDate,
  mergeDailyIntoSitemap,
  prettyDate,
  renderArchiveIndex,
  renderDailyPage,
  renderGrid,
  shiftDate,
  techniqueBreakdown,
  type DailyData,
  type DailyPuzzle,
} from "./daily-pages.js";

const TODAY = "2026-07-07";

describe("isValidDailyDate", () => {
  it("accepts dates inside the window", () => {
    expect(isValidDailyDate(ARCHIVE_START, TODAY)).toBe(true);
    expect(isValidDailyDate(TODAY, TODAY)).toBe(true);
    expect(isValidDailyDate("2026-06-15", TODAY)).toBe(true);
  });
  it("rejects the future, pre-window, junk, and impossible dates", () => {
    expect(isValidDailyDate("2026-07-08", TODAY)).toBe(false);
    expect(isValidDailyDate(shiftDate(ARCHIVE_START, -1), TODAY)).toBe(false);
    expect(isValidDailyDate("2026-7-7", TODAY)).toBe(false);
    expect(isValidDailyDate("not-a-date", TODAY)).toBe(false);
    expect(isValidDailyDate("2026-02-30", TODAY)).toBe(false);
    expect(isValidDailyDate("2026-13-01", TODAY)).toBe(false);
  });
});

describe("archiveDates", () => {
  it("runs newest-first from today to ARCHIVE_START", () => {
    const dates = archiveDates(TODAY);
    expect(dates[0]).toBe(TODAY);
    expect(dates[dates.length - 1]).toBe(ARCHIVE_START);
    expect(dates).toHaveLength(61); // 2026-05-08 .. 2026-07-07 inclusive
  });
  it("grows by one per day with no code change", () => {
    expect(archiveDates(shiftDate(TODAY, 1))).toHaveLength(62);
  });
});

describe("prettyDate", () => {
  it("formats without timezone drift", () => {
    expect(prettyDate("2026-07-07")).toBe("July 7, 2026");
    expect(prettyDate("2026-05-08")).toBe("May 8, 2026");
    expect(prettyDate("2026-12-31")).toBe("December 31, 2026");
  });
});

describe("techniqueBreakdown", () => {
  it("aggregates directional variants into one family, in ladder order", () => {
    const lines = techniqueBreakdown({
      ForcingChain: 1,
      HiddenSingleRow: 7,
      HiddenSingleCol: 3,
      NakedSingle: 43,
      XWingRow: 1,
      XWingCol: 1,
    });
    expect(lines.map((l) => [l.label, l.count])).toEqual([
      ["Naked single", 43],
      ["Hidden single", 10],
      ["X-Wing", 2],
      ["Forcing chain", 1],
    ]);
    expect(lines.map((l) => l.tier)).toEqual([1, 1, 3, 5]);
  });
  it("links cage combinations to the calculator", () => {
    const [line] = techniqueBreakdown({ CageCombo: 46 });
    expect(line?.href).toBe("/killer-sudoku-calculator");
  });
  it("still renders an unknown future technique key, unlinked", () => {
    const lines = techniqueBreakdown({ SkLoop: 2 });
    expect(lines).toEqual([{ label: "SkLoop", count: 2, tier: 5, href: "" }]);
  });
});

function classicPuzzle(): DailyPuzzle {
  const givens = "7".padEnd(81, ".");
  return {
    variant: "classic",
    givens,
    solution: "1".repeat(81),
    clue_count: 1,
    grade: {
      outcome: "solved",
      tier: 5,
      tier_label: "nightmare",
      steps: 62,
      technique_counts: { NakedSingle: 43, HiddenSingleRow: 7, XYWing: 2, ForcingChain: 1 },
    },
  };
}

function killerPuzzle(): DailyPuzzle {
  return {
    variant: "killer",
    givens: ".".repeat(81),
    solution: "1".repeat(81),
    clue_count: 0,
    cages: [
      { cells: [0, 1], sum: 9 },
      { cells: [9, 10], sum: 8 },
    ],
    grade: {
      outcome: "solved",
      tier: 2,
      tier_label: "medium",
      steps: 125,
      technique_counts: { NakedSingle: 52, CageCombo: 46 },
    },
  };
}

function dailyData(): DailyData {
  return { date: "2026-07-06", classic: classicPuzzle(), killer: killerPuzzle() };
}

describe("renderGrid", () => {
  it("marks givens and draws box borders", () => {
    const html = renderGrid(classicPuzzle(), "test grid");
    expect(html).toContain('class="g">7<');
    // Box boundaries: rows/cols 3 and 6 draw thick edges.
    expect(html).toContain('class="bt"');
    expect(html).toContain('class="bl"');
    expect(html).toContain('aria-label="test grid"');
  });
  it("draws dashed cage edges only across cage boundaries, sum on the head cell", () => {
    const html = renderGrid(killerPuzzle(), "killer grid");
    const cells = html.match(/<td[^>]*>.*?<\/td>/g)!;
    // Cell 1 shares a cage with cell 0 — no dashed left edge.
    expect(cells[1]).not.toContain("cl");
    // Cell 9 sits below cell 0 in a different cage — dashed top edge.
    expect(cells[9]).toContain("ct");
    // Sums render on each cage's lowest-index cell only.
    expect(cells[0]).toContain('<span class="s">9</span>');
    expect(cells[9]).toContain('<span class="s">8</span>');
    expect(cells[1]).not.toContain('class="s"');
  });
});

describe("renderDailyPage", () => {
  it("renders the classic page with grade, techniques, and play deep-link", () => {
    const html = renderDailyPage("classic", dailyData(), TODAY);
    expect(html).toContain("<title>Daily Classic Sudoku — July 6, 2026 | Stillgrid</title>");
    expect(html).toContain('rel="canonical" href="https://stillgrid.app/daily/classic/2026-07-06"');
    expect(html).toContain('href="/?d=classic&amp;date=2026-07-06"');
    expect(html).toContain("tier-nightmare");
    expect(html).toContain('<a href="/learn#naked-single">Naked single</a>');
    expect(html).toContain('<a href="/learn/advanced#swordfish">XY-Wing</a>');
    // Never leak the solution into the page.
    expect(html).not.toContain("1".repeat(81));
  });
  it("links adjacent days inside the window and the sibling variant", () => {
    const html = renderDailyPage("killer", dailyData(), TODAY);
    expect(html).toContain('href="/daily/killer/2026-07-05"');
    expect(html).toContain('href="/daily/killer/2026-07-07"');
    expect(html).toContain('href="/daily/classic/2026-07-06"');
    expect(html).toContain('href="/killer-sudoku-calculator"');
  });
  it("omits the next-day link on today's page", () => {
    const data = { ...dailyData(), date: TODAY };
    const html = renderDailyPage("classic", data, TODAY);
    expect(html).not.toContain(`/daily/classic/${shiftDate(TODAY, 1)}`);
  });
});

describe("renderArchiveIndex", () => {
  it("lists every archive date grouped by month, newest first", () => {
    const html = renderArchiveIndex(TODAY);
    expect(html).toContain("<h2>July 2026</h2>");
    expect(html).toContain("<h2>May 2026</h2>");
    expect(html).toContain(`href="/daily/classic/${TODAY}"`);
    expect(html).toContain(`href="/daily/killer/${ARCHIVE_START}"`);
    expect(html).toContain("(today)");
  });
});

describe("mergeDailyIntoSitemap", () => {
  const staticXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://stillgrid.app/</loc>\n  </url>\n</urlset>`;
  it("keeps static entries and appends index + per-date URLs", () => {
    const merged = mergeDailyIntoSitemap(staticXml, TODAY);
    expect(merged).toContain("<loc>https://stillgrid.app/</loc>");
    expect(merged).toContain("<loc>https://stillgrid.app/daily</loc>");
    expect(merged).toContain(`<loc>https://stillgrid.app/daily/classic/${TODAY}</loc>`);
    expect(merged).toContain(`<loc>https://stillgrid.app/daily/killer/${ARCHIVE_START}</loc>`);
    expect(merged.trim().endsWith("</urlset>")).toBe(true);
    // lastmod on a per-date URL is that date — a fresh signal every day.
    expect(merged).toContain(`<lastmod>${TODAY}</lastmod>`);
  });
});
