/**
 * Per-(variant × tier) personal-best storage.
 *
 * Schema (lives at localStorage key "stillgrid:bests:v1"):
 *
 *   {
 *     "classic-easy":   { bestScore, bestTimeSec, bestMistakes, solves, lastSolvedAt },
 *     "classic-medium": ...,
 *     "killer-any":     ...,
 *     ...
 *   }
 *
 * Bumps to schema → bump the storage key.
 */

const KEY = "stillgrid:bests:v1";

export interface Best {
  bestScore: number;
  bestTimeSec: number;
  bestMistakes: number;
  solves: number;
  lastSolvedAt: string; // ISO
}

export type Run = {
  variant: string;
  tierLabel: string | null;
  timeSec: number;
  mistakes: number;
  score: number;
};

function key(variant: string, tier: string | null): string {
  return `${variant}-${tier ?? "any"}`;
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

export function getBest(variant: string, tier: string | null): Best | null {
  const all = loadAll();
  return all[key(variant, tier)] ?? null;
}

export interface RecordOutcome {
  best: Best;
  newPersonalBest: boolean; // score improved
  newFastestTime: boolean;
  newFewestMistakes: boolean;
}

export function recordRun(run: Run): RecordOutcome {
  const all = loadAll();
  const k = key(run.variant, run.tierLabel);
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

export interface DailyDone {
  variant: "classic" | "killer";
  timeSec: number;
  mistakes: number;
  score: number;
  completedAt: string;
}

type DailyMap = Record<string, { classic?: DailyDone; killer?: DailyDone }>;

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

export function getDailyDone(date: string): { classic?: DailyDone; killer?: DailyDone } {
  return loadDaily()[date] ?? {};
}

export function markDailyDone(
  date: string,
  variant: "classic" | "killer",
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
  let day = new Date();
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
