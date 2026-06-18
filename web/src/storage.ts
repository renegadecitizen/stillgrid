/**
 * Per-(variant × size × tier) personal-best storage.
 *
 * Schema (lives at localStorage key "stillgrid:bests:v2"):
 *
 *   {
 *     "classic-9-easy":   { bestScore, bestTimeSec, bestMistakes, solves, lastSolvedAt },
 *     "classic-6-easy":   ...,
 *     "killer-9-any":     ...,
 *     ...
 *   }
 *
 * v1 keys were "variant-tier" (e.g. "classic-easy"); migration reads them as
 * size=9 entries. Bumps to schema → bump the storage key.
 */

const KEY = "stillgrid:bests:v2";
const LEGACY_KEY = "stillgrid:bests:v1";

export interface Best {
  bestScore: number;
  bestTimeSec: number;
  bestMistakes: number;
  solves: number;
  lastSolvedAt: string; // ISO
}

export type Run = {
  variant: string;
  size: number;
  tierLabel: string | null;
  timeSec: number;
  mistakes: number;
  score: number;
};

function key(variant: string, size: number, tier: string | null): string {
  return `${variant}-${size}-${tier ?? "any"}`;
}

function loadAll(): Record<string, Best> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, Best>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota / disabled — silently ignore */
  }
}

// Idempotent: only runs when v2 store is absent and a v1 blob exists.
// v1 keys look like "classic-easy" or "killer-any" — split on last "-".
function migrateBestsV1IfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(KEY) !== null) return;
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const v1 = JSON.parse(raw);
    if (!v1 || typeof v1 !== "object") return;
    const v2: Record<string, Best> = {};
    for (const legacyKey of Object.keys(v1)) {
      const lastDash = legacyKey.lastIndexOf("-");
      if (lastDash < 0) continue;
      const variant = legacyKey.slice(0, lastDash);
      const tier = legacyKey.slice(lastDash + 1);
      const newKey = `${variant}-9-${tier}`;
      v2[newKey] = v1[legacyKey];
    }
    saveAll(v2);
  } catch {
    /* migration is best-effort */
  }
}

export function getBest(variant: string, size: number, tier: string | null): Best | null {
  migrateBestsV1IfNeeded();
  const all = loadAll();
  return all[key(variant, size, tier)] ?? null;
}

export interface RecordOutcome {
  best: Best;
  newPersonalBest: boolean; // score improved
  newFastestTime: boolean;
  newFewestMistakes: boolean;
}

export function recordRun(run: Run): RecordOutcome {
  migrateBestsV1IfNeeded();
  const all = loadAll();
  const k = key(run.variant, run.size, run.tierLabel);
  const prev = all[k];

  const beatScore = !prev || run.score > prev.bestScore;
  const beatTime = !prev || run.timeSec < prev.bestTimeSec;
  const fewerMist = !prev || run.mistakes < prev.bestMistakes;

  const next: Best = prev
    ? {
        bestScore: Math.max(prev.bestScore, run.score),
        bestTimeSec: Math.min(prev.bestTimeSec, run.timeSec),
        bestMistakes: Math.min(prev.bestMistakes, run.mistakes),
        solves: prev.solves + 1,
        lastSolvedAt: new Date().toISOString(),
      }
    : {
        bestScore: run.score,
        bestTimeSec: run.timeSec,
        bestMistakes: run.mistakes,
        solves: 1,
        lastSolvedAt: new Date().toISOString(),
      };

  all[k] = next;
  saveAll(all);

  return {
    best: next,
    newPersonalBest: beatScore,
    newFastestTime: beatTime,
    newFewestMistakes: fewerMist,
  };
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// --- Daily challenge completion + streak ---------------------------------

const DAILY_KEY = "stillgrid:daily:v1";

export type StreakVariant = "classic" | "xsudoku" | "jigsaw" | "killer";

export interface DailyDone {
  variant: StreakVariant;
  timeSec: number;
  mistakes: number;
  score: number;
  completedAt: string;
}

type DailyMap = Record<string, Partial<Record<StreakVariant, DailyDone>>>;

function loadDaily(): DailyMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DAILY_KEY);
    return raw ? (JSON.parse(raw) as DailyMap) : {};
  } catch {
    return {};
  }
}

function saveDaily(d: DailyMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DAILY_KEY, JSON.stringify(d));
  } catch {}
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyDone(date: string): Partial<Record<StreakVariant, DailyDone>> {
  return loadDaily()[date] ?? {};
}

export function markDailyDone(
  date: string,
  variant: StreakVariant,
  run: { timeSec: number; mistakes: number; score: number },
): void {
  const all = loadDaily();
  const cur = all[date] ?? {};
  cur[variant] = {
    variant,
    completedAt: new Date().toISOString(),
    ...run,
  };
  all[date] = cur;
  saveDaily(all);
}

/** Current streak: consecutive days, ending today (or yesterday if today's
 *  not yet solved), with at least one daily completion. */
export function getStreak(): number {
  const all = loadDaily();
  // Start counting from today.
  const day = new Date();
  let streak = 0;
  // If today isn't solved yet, the streak can still be alive from yesterday.
  const todayStr = day.toISOString().slice(0, 10);
  const todayDone = !!all[todayStr];
  if (!todayDone) day.setUTCDate(day.getUTCDate() - 1);
  // Now walk backwards.
  while (true) {
    const key = day.toISOString().slice(0, 10);
    if (!all[key]) break;
    streak += 1;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return streak;
}

// --- First-visit tracking (for Plausible first_visit_ever event) -----------

const FIRST_VISIT_KEY = "stillgrid:first_visit:v1";

export function hasVisitedBefore(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(FIRST_VISIT_KEY) !== null;
  } catch {
    return false;
  }
}

export function markVisited(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FIRST_VISIT_KEY, new Date().toISOString());
  } catch {
    /* quota / disabled — silently ignore */
  }
}
