/**
 * The daily puzzle seed derivation — deliberately in its own module.
 *
 * Two very different things depend on this being the same function:
 *
 *   1. `scripts/prerender.ts`, which bakes /daily/<kind>/<date> pages at build
 *      time using the native engine binaries.
 *   2. `src/engine/api.ts`, which generates the daily puzzle in the browser
 *      using the WebAssembly engine.
 *
 * If those two ever disagreed, the archive page for a date would show a
 * different puzzle than the one the app hands you for that same date — a bug
 * that would be quiet, permanent, and baked into pages crawlers had already
 * indexed. Sharing one definition makes that drift impossible rather than
 * merely tested for.
 */

export type DailyKind = "classic" | "killer";

/** Same derivation the Express server used, preserved exactly. */
export function dailySeed(date: string, kind: DailyKind): number {
  // YYYY-MM-DD → an integer, with a per-kind salt so the two puzzles diverge.
  const [y, m, d] = date.split("-").map(Number);
  const base = (y! * 10000 + m! * 100 + d!) * 1000;
  return base + (kind === "classic" ? 1 : 2);
}

/** Today's date in UTC, matching the archive's notion of "today". */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
