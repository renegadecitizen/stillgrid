import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getBest,
  recordRun,
  getStreak,
  markDailyDone,
  getDailyDone,
  todayKey,
  hasVisitedBefore,
  markVisited,
  type Best,
  type RecordOutcome,
} from "./storage";
import { track } from "./analytics";
import {
  type BoardState,
  type Size,
  initialState,
  isSolved as boardIsSolved,
  autoPencil as boardAutoPencil,
  clearAllNotes as boardClearAllNotes,
  placeValue,
  toggleNote,
  clearCell,
  listNotes,
  getValue,
  boxDims,
  defaultBoxOf,
  digitToChar,
  charToDigit,
} from "./boardState";

type Variant = "classic" | "xsudoku" | "jigsaw" | "killer";

interface Cage {
  cells: number[];
  sum: number;
}

interface PuzzleResponse {
  variant: Variant;
  givens: string;
  solution: string;
  size?: number;
  clue_count: number;
  diagonals?: boolean;
  box_of?: number[];
  cages?: Cage[];
  grade?:
    | {
        outcome: "solved";
        tier: number;
        tier_label: string;
        steps: number;
        technique_counts: Record<string, number>;
      }
    | { outcome: "stuck"; steps_taken: number };
  tier_matched?: boolean;
  note?: string;
}

const VARIANT_COLOR: Record<Variant, { main: string; soft: string; label: string }> = {
  classic: { main: "var(--color-sage)", soft: "var(--color-sage-soft)", label: "Classic" },
  xsudoku: { main: "var(--color-teal)", soft: "var(--color-teal-soft)", label: "X-Sudoku" },
  jigsaw: { main: "var(--color-plum)", soft: "var(--color-plum-soft)", label: "Jigsaw" },
  killer: { main: "var(--color-terracotta)", soft: "var(--color-terracotta-soft)", label: "Killer" },
};

const TIER_COLOR: Record<string, { main: string; soft: string }> = {
  easy: { main: "var(--color-easy)", soft: "var(--color-easy-soft)" },
  medium: { main: "var(--color-medium)", soft: "var(--color-medium-soft)" },
  hard: { main: "var(--color-hard)", soft: "var(--color-hard-soft)" },
};

// UI tier options allowed per board size. 16×16 keeps only Any/Easy/Medium —
// Hard is unreachable at the 47% clue floor (measured 2026-06-02), so offering it
// would just spin the server's 60-retry loop. X-Sudoku never sends a tier (TierSelect
// is disabled for non-classic variants).
const TIERS_BY_SIZE: Record<Size, string[]> = {
  6: ["", "easy", "medium", "hard"],
  9: ["", "easy", "medium", "hard"],
  16: ["", "easy", "medium"],
};

const kbd: React.CSSProperties = {
  background: "var(--color-paper)",
  border: "1px solid var(--color-divider)",
  borderRadius: 3,
  padding: "0 4px",
  fontFamily: "var(--font-body)",
  fontSize: 10,
  color: "var(--color-ink-soft)",
};

function blurbFor(variant: Variant, n: number): string {
  const { bh, bw } = boxDims(n);
  switch (variant) {
    case "classic":
      return `The original. Rows, columns, and ${bh}×${bw} boxes — each holds 1 through ${n}.`;
    case "xsudoku":
      return `Classic, plus both main diagonals must contain 1 through ${n}.`;
    case "jigsaw":
      return `The boxes aren't ${bh}×${bw} — they're irregular regions of ${n} cells.`;
    case "killer":
      return "No starting digits. Cages give you a target sum; no digit repeats inside a cage.";
  }
}

export function App() {
  const [puzzle, setPuzzle] = useState<PuzzleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [tier, setTier] = useState<string>("");
  const [variant, setVariant] = useState<Variant>("classic");
  const [size, setSize] = useState<Size>(9);
  const [showSolution, setShowSolution] = useState(false);
  // If the currently-loaded puzzle came from a "daily" load, we mark its
  // completion in the daily streak store.
  const [dailyTag, setDailyTag] = useState<{ date: string; kind: "classic" | "killer" } | null>(
    null,
  );

  const isDemo = import.meta.env.VITE_DEMO === "1";

  const load = (vArg: Variant = variant, tArg: string = tier, sArg: Size = size) => {
    setPuzzle(null);
    setError(null);
    setShowSolution(false);
    setDailyTag(null);
    const t0 = performance.now();

    // Demo pool is 9×9 only — skip it for 6×6 requests and fall through to the
    // API fetch, which the dev server proxies to :3001.
    if (isDemo && sArg === 9) {
      fetch("puzzles.json")
        .then((r) => r.json())
        .then((pool: Record<Variant, PuzzleResponse[]>) => {
          const choices = pool[vArg];
          if (!choices?.length) return setError(`no demo puzzles for ${vArg}`);
          const pick = choices[Math.floor(Math.random() * choices.length)]!;
          setPuzzle(pick);
          setElapsedMs(Math.round(performance.now() - t0));
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      return;
    }

    const params = new URLSearchParams({ variant: vArg });
    if (tArg && vArg === "classic") params.set("tier", tArg);
    params.set("size", String(sArg));
    fetch(`/api/puzzle?${params}`)
      .then((r) => r.json())
      .then((data: PuzzleResponse | { error: string }) => {
        if ("error" in data) setError(data.error);
        else {
          setPuzzle(data);
          setElapsedMs(Math.round(performance.now() - t0));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  // Load today's daily for a given variant. Demo mode reads from puzzles.json
  // under a "daily" key; production hits /api/daily.
  const loadDaily = (kind: "classic" | "killer") => {
    setPuzzle(null);
    setError(null);
    setShowSolution(false);
    const date = todayKey();
    const t0 = performance.now();

    if (isDemo) {
      fetch("puzzles.json")
        .then((r) => r.json())
        .then(
          (pool: Record<string, PuzzleResponse[]> & {
            daily?: { date: string; classic: PuzzleResponse; killer: PuzzleResponse };
          }) => {
            const d = pool.daily;
            if (!d) return setError("no daily in demo pool");
            const pick = kind === "classic" ? d.classic : d.killer;
            setVariant(pick.variant);
            setTier("");
            setSize(9);
            setPuzzle(pick);
            setDailyTag({ date: d.date, kind });
            setElapsedMs(Math.round(performance.now() - t0));
          },
        )
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      return;
    }

    fetch(`/api/daily?date=${date}`)
      .then((r) => r.json())
      .then((data: { date: string; classic: PuzzleResponse; killer: PuzzleResponse } | { error: string }) => {
        if ("error" in data) {
          setError(data.error);
          return;
        }
        const pick = kind === "classic" ? data.classic : data.killer;
        setVariant(pick.variant);
        setTier("");
        setSize(9);
        setPuzzle(pick);
        setDailyTag({ date: data.date, kind });
        setElapsedMs(Math.round(performance.now() - t0));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => load("classic", "", 9), []);

  // Fire first_visit_ever once per browser (localStorage-flagged).
  // Mount-only effect — empty deps array.
  useEffect(() => {
    if (!hasVisitedBefore()) {
      track("first_visit_ever");
      markVisited();
    }
  }, []);

  const variantColor = VARIANT_COLOR[variant];
  // Play-surface accent: difficulty color takes over when set (matches what
  // the user picked); otherwise fall back to the variant's hue.
  const playAccent =
    tier && TIER_COLOR[tier] ? TIER_COLOR[tier] : { main: variantColor.main, soft: variantColor.soft };

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-20">
        <Hero />

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2">
            <Controls
              variant={variant}
              tier={tier}
              size={size}
              variantColor={variantColor.main}
              dailyActive={dailyTag !== null}
              onVariant={(v) => {
                setVariant(v);
                const nextSize: Size = size === 16 && v !== "classic" && v !== "xsudoku" ? 9 : size;
                if (nextSize !== size) setSize(nextSize);
                load(v, tier, nextSize);
              }}
              onTier={(t) => {
                setTier(t);
                load(variant, t, size);
              }}
              onSize={(s) => {
                setSize(s);
                const allowed = TIERS_BY_SIZE[s];
                const nextTier = allowed.includes(tier) ? tier : "";
                if (nextTier !== tier) setTier(nextTier);
                load(variant, nextTier, s);
              }}
              onNew={() => load(variant, tier, size)}
            />

            <p
              className="mt-4 text-sm italic leading-relaxed"
              style={{ color: "var(--color-ink-soft)" }}
            >
              {blurbFor(variant, size)}
            </p>

            {error && (
              <p
                className="mt-6 text-sm rounded-lg px-4 py-3"
                style={{ background: "#fee", color: "#7a1f1f", border: "1px solid #fcc" }}
              >
                {error}
              </p>
            )}

            {!puzzle && !error && (
              <p className="mt-8 text-sm" style={{ color: "var(--color-ink-mute)" }}>
                generating…
              </p>
            )}

            {puzzle && (
              <PlayCard
                puzzle={puzzle}
                elapsedMs={elapsedMs}
                showSolution={showSolution}
                onToggleSolution={() => setShowSolution((s) => !s)}
                variantAccent={variantColor.main}
                variantAccentSoft={variantColor.soft}
                playAccent={playAccent.main}
                playAccentSoft={playAccent.soft}
                dailyTag={dailyTag}
              />
            )}
          </section>

          <aside className="lg:col-span-1 space-y-4">
            <DailyCard onPlay={loadDaily} />
            <StreakCard />
            <VariantsCard active={variant} onPick={(v) => { setVariant(v); load(v, tier, size); }} />
            <RoadmapCard />
          </aside>
        </div>
      </main>
      <Footer isDemo={isDemo} />
    </div>
  );
}

// --- Topbar / Hero -------------------------------------------------------

function Topbar() {
  return (
    <div className="border-b" style={{ borderColor: "var(--color-divider)", background: "rgba(250, 247, 242, 0.7)" }}>
      <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between text-xs">
        <span style={{ color: "var(--color-ink-mute)" }}>stillgrid.app</span>
        <div className="flex items-center gap-5" style={{ color: "var(--color-ink-soft)" }}>
          <a href="#" className="hover:text-ink transition-colors">Play</a>
          <a href="#" className="hover:text-ink transition-colors">Daily</a>
          <a href="#" className="hover:text-ink transition-colors">Learn</a>
          <a href="#" className="hover:text-ink transition-colors">About</a>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <header className="flex items-start justify-between gap-8 flex-wrap">
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-baseline gap-3">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md" style={{ background: "var(--color-sage)", color: "white" }}>
            <GridMark />
          </span>
          <h1 className="text-6xl leading-none tracking-tight" style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}>Stillgrid</h1>
          <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--color-ink-mute)" }}>v0.1</span>
        </div>
        <p className="text-xl italic" style={{ fontFamily: "var(--font-display)", color: "var(--color-ink-soft)" }}>
          Sudoku, the quiet way.
        </p>
        <p className="text-sm max-w-md leading-relaxed mt-1" style={{ color: "var(--color-ink-soft)" }}>
          A modern sudoku site with variants, technique-graded difficulty, and no signup.
          Made for the morning cup of coffee.
        </p>
      </div>
      <div className="text-right text-xs flex flex-col items-end gap-1" style={{ color: "var(--color-ink-mute)" }}>
        <Badge color="var(--color-sage)" text="100% solvable" />
        <Badge color="var(--color-teal)" text="4 variants live" />
        <Badge color="var(--color-plum)" text="No signup, ever" />
      </div>
    </header>
  );
}

function GridMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="0.5" y="0.5" width="13" height="13" rx="2" stroke="white" strokeWidth="1" />
      <line x1="5" y1="1" x2="5" y2="13" stroke="white" strokeWidth="1" opacity="0.7" />
      <line x1="9" y1="1" x2="9" y2="13" stroke="white" strokeWidth="1" opacity="0.7" />
      <line x1="1" y1="5" x2="13" y2="5" stroke="white" strokeWidth="1" opacity="0.7" />
      <line x1="1" y1="9" x2="13" y2="9" stroke="white" strokeWidth="1" opacity="0.7" />
    </svg>
  );
}

function Badge({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span>{text}</span>
    </span>
  );
}

// --- controls ------------------------------------------------------------

function Controls({
  variant,
  tier,
  size,
  variantColor,
  dailyActive,
  onVariant,
  onTier,
  onSize,
  onNew,
}: {
  variant: Variant;
  tier: string;
  size: Size;
  variantColor: string;
  dailyActive: boolean;
  onVariant: (v: Variant) => void;
  onTier: (t: string) => void;
  onSize: (s: Size) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <SetupRow label="Size">
        <SizeSelect value={size} variant={variant} onChange={onSize} disabled={dailyActive} />
      </SetupRow>
      <SetupRow label="Variant">
        <VariantSelect value={variant} onChange={onVariant} />
      </SetupRow>
      <SetupRow label="Difficulty">
        <TierSelect value={tier} allowed={TIERS_BY_SIZE[size]} onChange={onTier} disabled={variant !== "classic"} />
      </SetupRow>
      <div className="flex pt-1">
        <button
          onClick={onNew}
          className="rounded-full px-5 py-1.5 text-sm font-medium transition-colors text-white"
          style={{ background: variantColor }}
        >
          New puzzle
        </button>
      </div>
    </div>
  );
}

// Label-left setup row: a small fixed-width category label + its control.
function SetupRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span
        className="w-20 shrink-0 text-[11px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--color-ink-mute)" }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function SizeSelect({ value, variant, onChange, disabled }: { value: Size; variant: Variant; onChange: (s: Size) => void; disabled?: boolean }) {
  const supports16 = variant === "classic" || variant === "xsudoku";
  const options: { v: Size; label: string }[] = [
    { v: 6, label: "6×6" },
    { v: 9, label: "9×9" },
    { v: 16, label: "16×16" },
  ];
  return (
    <div
      className="inline-flex rounded-full p-0.5 gap-0.5"
      style={{ background: "var(--color-card)", border: "1px solid var(--color-divider)", opacity: disabled ? 0.5 : 1 }}
    >
      {options.map(({ v, label }) => {
        const active = v === value;
        const optDisabled = disabled || (v === 16 && !supports16);
        return (
          <button
            key={v}
            disabled={optDisabled}
            title={v === 16 && !supports16 ? "16×16 is available for Classic and X-Sudoku" : undefined}
            onClick={() => onChange(v)}
            className="px-3 py-1 text-xs rounded-full transition-colors"
            style={{
              background: active ? "var(--color-ink-soft)" : "transparent",
              color: active ? "white" : "var(--color-ink-soft)",
              opacity: optDisabled && !active ? 0.4 : 1,
              cursor: optDisabled ? "not-allowed" : "pointer",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function VariantSelect({ value, onChange }: { value: Variant; onChange: (v: Variant) => void }) {
  const options: Variant[] = ["classic", "xsudoku", "jigsaw", "killer"];
  return (
    <div className="inline-flex rounded-full p-0.5 gap-0.5" style={{ background: "var(--color-card)", border: "1px solid var(--color-divider)" }}>
      {options.map((v) => {
        const active = v === value;
        const c = VARIANT_COLOR[v];
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className="px-3 py-1 text-xs rounded-full transition-colors"
            style={{ background: active ? c.main : "transparent", color: active ? "white" : "var(--color-ink-soft)" }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

function TierSelect({ value, allowed, onChange, disabled }: { value: string; allowed: string[]; onChange: (v: string) => void; disabled?: boolean }) {
  const options = [
    { v: "", label: "Any" },
    { v: "easy", label: "Easy" },
    { v: "medium", label: "Medium" },
    { v: "hard", label: "Hard" },
  ].filter((o) => allowed.includes(o.v));
  return (
    <div className="inline-flex rounded-full p-0.5 gap-0.5" style={{ background: "var(--color-card)", border: "1px solid var(--color-divider)", opacity: disabled ? 0.5 : 1 }}>
      {options.map(({ v, label }) => {
        const active = v === value;
        const tc = TIER_COLOR[v];
        return (
          <button
            key={v}
            disabled={disabled}
            onClick={() => onChange(v)}
            className="px-3 py-1 text-xs rounded-full transition-colors"
            style={{ background: active ? (tc?.main ?? "var(--color-ink-soft)") : "transparent", color: active ? "white" : "var(--color-ink-soft)", cursor: disabled ? "not-allowed" : "pointer" }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// --- playable card (selection + keyboard input) --------------------------

function PlayCard({
  puzzle,
  elapsedMs,
  showSolution,
  onToggleSolution,
  variantAccent,
  variantAccentSoft,
  playAccent,
  playAccentSoft,
  dailyTag,
}: {
  puzzle: PuzzleResponse;
  elapsedMs: number | null;
  showSolution: boolean;
  onToggleSolution: () => void;
  variantAccent: string;
  variantAccentSoft: string;
  playAccent: string;
  playAccentSoft: string;
  dailyTag: { date: string; kind: "classic" | "killer" } | null;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);
  // Snapshot-based history. history[historyIdx] is the current state.
  const [history, setHistory] = useState<BoardState[]>(() => [initialState(puzzle.givens)]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const state = history[historyIdx]!;

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [mistakes, setMistakes] = useState(0);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<RecordOutcome | null>(null);

  // For puzzle_abandoned tracking: snapshot of current in-progress state.
  // Read by the reset effect when puzzle.givens changes to decide whether
  // to fire puzzle_abandoned for the OUTGOING puzzle.
  const prevInProgressRef = useRef<{
    variant: string;
    size: Size;
    tier: string | null;
    progressPct: number;
  } | null>(null);

  // Tracks which puzzle.givens the current `state` corresponds to. Used
  // by the ref-update effect to skip writes during the in-between render
  // after puzzle.givens changes but before state has been reset to the
  // new initialState. Without this guard, the ref would receive garbage
  // mixing the new puzzle's variant/tier with the old puzzle's progress.
  const stateBelongsToRef = useRef<string | null>(null);

  const tierBucket: string | null =
    puzzle.grade && puzzle.grade.outcome === "solved" ? puzzle.grade.tier_label : null;

  const [currentBest, setCurrentBest] = useState<Best | null>(null);
  useEffect(() => {
    const puzzleSize = (puzzle.givens.length === 36 ? 6 : puzzle.givens.length === 256 ? 16 : 9) as Size;
    setCurrentBest(getBest(puzzle.variant, puzzleSize, tierBucket));
  }, [puzzle.variant, puzzle.givens, tierBucket]);

  // Reset everything on puzzle change. First, if the PREVIOUS puzzle was in
  // progress and never completed, fire puzzle_abandoned with its last-seen
  // state. The ref is updated continuously by the effect above while a
  // puzzle is in progress.
  useEffect(() => {
    const prev = prevInProgressRef.current;
    if (prev !== null) {
      track("puzzle_abandoned", {
        variant: prev.variant,
        size: prev.size,
        tier: prev.tier ?? "any",
        progress_pct: prev.progressPct,
      });
      prevInProgressRef.current = null;
    }

    setSelected(null);
    setNotesMode(false);
    setHistory([initialState(puzzle.givens)]);
    setHistoryIdx(0);
    setStartedAt(null);
    setMistakes(0);
    setFinishedAt(null);
    setOutcome(null);
  }, [puzzle.givens]);

  // Track puzzle_started on every new puzzle load.
  // Strict deps: puzzle.variant, tierBucket, dailyTag change in lockstep
  // with puzzle.givens, so we deliberately omit them to keep this single-fire.
  useEffect(() => {
    const puzzleSize = (puzzle.givens.length === 36 ? 6 : puzzle.givens.length === 256 ? 16 : 9) as Size;
    track("puzzle_started", {
      variant: puzzle.variant,
      size: puzzleSize,
      tier: tierBucket ?? "any",
      is_daily: dailyTag !== null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.givens]);

  // Mark the current `state` as belonging to the current puzzle.givens.
  // Strict deps: ONLY [state]. Deliberately omits puzzle.givens — if both
  // were deps, this effect would fire in the render where puzzle.givens
  // changes but state hasn't yet been reset, prematurely writing B.givens
  // to the ref and letting the ref-update effect's guard pass with stale
  // state. Depending only on state means the ref lags by exactly one
  // render in that transition, giving the guard a true signal.
  useEffect(() => {
    stateBelongsToRef.current = puzzle.givens;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Keep prevInProgressRef current while THIS puzzle is in progress.
  // When the puzzle is solved (finishedAt set) or abandoned (reset effect
  // fires), the ref is cleared.
  //
  // Guard: skip write when `state` doesn't yet correspond to puzzle.givens —
  // this happens in the render after puzzle changes but before reset's
  // setHistory call has applied. Without the guard, we'd write garbage
  // mixing the new puzzle's variant/tier with the old puzzle's progress.
  useEffect(() => {
    if (stateBelongsToRef.current !== puzzle.givens) return;
    if (startedAt !== null && finishedAt === null) {
      const puzzleSize = (puzzle.givens.length === 36 ? 6 : puzzle.givens.length === 256 ? 16 : 9) as Size;
      const cells = puzzleSize * puzzleSize;
      const givenCount = state.givenMask.reduce((a, b) => a + b, 0);
      const userCells = cells - givenCount;
      let userFilled = 0;
      for (let i = 0; i < cells; i++) {
        if ((state.givenMask[i] ?? 0) === 0 && (state.values[i] ?? 0) !== 0) {
          userFilled += 1;
        }
      }
      const progressPct = userCells === 0 ? 0 : Math.floor((userFilled / userCells) * 100);
      prevInProgressRef.current = {
        variant: puzzle.variant,
        size: puzzleSize,
        tier: tierBucket,
        progressPct,
      };
    } else if (finishedAt !== null) {
      // Puzzle finished — not an abandonment candidate
      prevInProgressRef.current = null;
    }
  }, [startedAt, finishedAt, state, puzzle.variant, tierBucket]);

  // Tick the clock
  useEffect(() => {
    if (startedAt === null || finishedAt !== null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, finishedAt]);

  const pushState = useCallback((next: BoardState) => {
    if (next === state) return;
    setStartedAt((s) => s ?? Date.now());
    setHistory((h) => [...h.slice(0, historyIdx + 1), next]);
    setHistoryIdx((i) => i + 1);
  }, [historyIdx, state]);

  const isGiven = useCallback((i: number) => state.givenMask[i] === 1, [state.givenMask]);

  const handlePlace = useCallback(
    (i: number, v: number) => {
      if (isGiven(i)) return;
      // mistake counter: did the user place a wrong value?
      const expected = charToDigit(puzzle.solution[i] ?? "");
      const current = state.values[i] ?? 0;
      if (v !== expected && current !== v) {
        setMistakes((m) => m + 1);
      }
      // Tapping the same digit clears it (familiar UX).
      const next = current === v ? clearCell(state, i) : placeValue(state, i, v);
      pushState(next);
    },
    [isGiven, puzzle.solution, state, pushState],
  );

  const handleToggleNote = useCallback(
    (i: number, d: number) => {
      if (isGiven(i)) return;
      pushState(toggleNote(state, i, d));
    },
    [isGiven, state, pushState],
  );

  const handleClear = useCallback(
    (i: number) => {
      if (isGiven(i)) return;
      pushState(clearCell(state, i));
    },
    [isGiven, state, pushState],
  );

  const handleAutoPencil = useCallback(() => {
    pushState(boardAutoPencil(state));
  }, [state, pushState]);

  const handleClearAllNotes = useCallback(() => {
    pushState(boardClearAllNotes(state));
  }, [state, pushState]);

  const handleUndo = useCallback(() => {
    setHistoryIdx((i) => (i > 0 ? i - 1 : i));
  }, []);
  const handleRedo = useCallback(() => {
    setHistoryIdx((i) => (i < history.length - 1 ? i + 1 : i));
  }, [history.length]);

  const n = state.n;

  // Keyboard handling
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isInput = (e.target as HTMLElement)?.tagName === "INPUT";
      if (isInput) return;

      // Global shortcuts (don't require a selected cell)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) handleRedo();
        else handleUndo();
        e.preventDefault();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        handleRedo();
        e.preventDefault();
        return;
      }
      if (e.key === "n" || e.key === "N") {
        setNotesMode((m) => !m);
        e.preventDefault();
        return;
      }

      if (selected === null) return;

      const r = Math.floor(selected / n);
      const c = selected % n;

      const d = charToDigit(e.key);
      if (d >= 1 && d <= n) {
        // Shift+digit always toggles a note. Otherwise honor notes mode.
        if (e.shiftKey || notesMode) handleToggleNote(selected, d);
        else handlePlace(selected, d);
        e.preventDefault();
      } else if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") {
        handleClear(selected);
        e.preventDefault();
      } else if (e.key === "ArrowLeft" && c > 0) {
        setSelected(selected - 1);
        e.preventDefault();
      } else if (e.key === "ArrowRight" && c < n - 1) {
        setSelected(selected + 1);
        e.preventDefault();
      } else if (e.key === "ArrowUp" && r > 0) {
        setSelected(selected - n);
        e.preventDefault();
      } else if (e.key === "ArrowDown" && r < n - 1) {
        setSelected(selected + n);
        e.preventDefault();
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, notesMode, n, handlePlace, handleToggleNote, handleClear, handleUndo, handleRedo]);

  const isSolved = useMemo(
    () => boardIsSolved(state, puzzle.solution),
    [state, puzzle.solution],
  );

  // Lock the clock when solved
  useEffect(() => {
    if (isSolved && finishedAt === null && startedAt !== null) {
      setFinishedAt(Date.now());
    }
  }, [isSolved, finishedAt, startedAt]);

  useEffect(() => {
    if (!isSolved || finishedAt === null || startedAt === null || outcome) return;
    const seconds = Math.max(1, Math.floor((finishedAt - startedAt) / 1000));
    const puzzleSize = (puzzle.givens.length === 36 ? 6 : puzzle.givens.length === 256 ? 16 : 9) as Size;
    const tierLabel =
      puzzle.grade && puzzle.grade.outcome === "solved" ? puzzle.grade.tier_label : "easy";
    const tierMult: Record<string, number> = {
      easy: 1, medium: 2, hard: 4, diabolical: 8, nightmare: 16,
    };
    const raw = (1000 * (tierMult[tierLabel] ?? 1)) / Math.sqrt(seconds);
    const scoreValue = Math.max(0, Math.round(raw - mistakes * 50));
    const result = recordRun({
      variant: puzzle.variant,
      size: puzzleSize,
      tierLabel: tierBucket,
      timeSec: seconds,
      mistakes,
      score: scoreValue,
    });
    setOutcome(result);
    setCurrentBest(result.best);

    track("puzzle_completed", {
      variant: puzzle.variant,
      size: puzzleSize,
      tier: tierBucket ?? "any",
      is_daily: dailyTag !== null,
      duration_seconds: seconds,
    });

    // Every solve counts toward the streak — daily or not. If this puzzle
    // came from the daily UI, record under its (date, kind); otherwise
    // record under today + current variant.
    const solveDate = dailyTag ? dailyTag.date : todayKey();
    const solveVariant = dailyTag ? dailyTag.kind : puzzle.variant;
    markDailyDone(solveDate, solveVariant, {
      timeSec: seconds,
      mistakes,
      score: scoreValue,
    });

    // Fire daily_streak_milestone if this completion crosses a notable
    // streak length. getStreak() recomputes from the solves store, so
    // call it AFTER markDailyDone to get the post-completion value.
    const streakAfter = getStreak();
    const STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365];
    if (STREAK_MILESTONES.includes(streakAfter)) {
      track("daily_streak_milestone", { length: streakAfter });
    }

    // Force the streak widget to refresh next render.
    window.dispatchEvent(new CustomEvent("stillgrid:dailyDone"));
  }, [isSolved, finishedAt, startedAt, mistakes, outcome, puzzle.variant, puzzle.grade, tierBucket, dailyTag]);

  const elapsedSeconds =
    startedAt === null
      ? 0
      : Math.floor(((finishedAt ?? now) - startedAt) / 1000);

  // Provisional score: difficulty × time × accuracy.
  // We don't ship a "rating" yet — this is just the formula we'll use when
  // accounts + leaderboards land. Hidden until solved to avoid distracting.
  const score = useMemo(() => {
    if (!isSolved || finishedAt === null || startedAt === null) return null;
    const seconds = Math.max(1, Math.floor((finishedAt - startedAt) / 1000));
    const tierLabel =
      puzzle.grade && puzzle.grade.outcome === "solved"
        ? puzzle.grade.tier_label
        : "easy";
    const tierMult: Record<string, number> = {
      easy: 1,
      medium: 2,
      hard: 4,
      diabolical: 8,
      nightmare: 16,
    };
    const base = 1000;
    const raw = (base * (tierMult[tierLabel] ?? 1)) / Math.sqrt(seconds);
    const penalty = mistakes * 50;
    return Math.max(0, Math.round(raw - penalty));
  }, [isSolved, finishedAt, startedAt, mistakes, puzzle.grade]);

  return (
    <div
      className="rounded-2xl p-4 sm:p-8 mt-6"
      style={{ background: "var(--color-card)", boxShadow: "var(--shadow-paper)", borderTop: `3px solid ${variantAccent}` }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg" style={{ fontFamily: "var(--font-display)", fontWeight: 500, color: variantAccent }}>
            {VARIANT_COLOR[puzzle.variant].label}
          </h2>
          <div className="text-xs flex items-baseline gap-2 flex-wrap" style={{ color: "var(--color-ink-mute)" }}>
            {puzzle.clue_count > 0 && <span>{puzzle.clue_count} clues</span>}
            {puzzle.cages && <span>· {puzzle.cages.length} cages</span>}
            {puzzle.grade && puzzle.grade.outcome === "solved" && (
              <TierBadge tier={puzzle.grade.tier_label} steps={puzzle.grade.steps} />
            )}
            {puzzle.grade && puzzle.grade.outcome === "stuck" && (
              <span style={{ color: "var(--color-medium)", fontStyle: "italic" }}>· needs Tier 4+ techniques</span>
            )}
          </div>
        </div>
        {/* live stats: timer + mistakes + best (right-aligned) */}
        <div className="flex flex-col items-end gap-1 text-xs tabular-nums">
          <div className="flex items-baseline gap-3" style={{ color: "var(--color-ink-soft)" }}>
            <Stat label="time" value={formatTime(elapsedSeconds)} accent={playAccent} active={startedAt !== null && finishedAt === null} />
            <Stat label="mistakes" value={String(mistakes)} accent={mistakes > 0 ? "var(--color-error)" : "var(--color-ink-mute)"} />
          </div>
          {currentBest && (
            <div
              className="text-[10px] flex items-baseline gap-1.5"
              style={{ color: "var(--color-ink-mute)" }}
            >
              <span className="uppercase tracking-wider">Best</span>
              <span style={{ color: "var(--color-ink-soft)", fontWeight: 500 }}>
                {formatTime(currentBest.bestTimeSec)} · {currentBest.bestMistakes} mistake{currentBest.bestMistakes === 1 ? "" : "s"}
              </span>
              <span style={{ opacity: 0.6 }}>· {currentBest.solves} solve{currentBest.solves === 1 ? "" : "s"}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        <Grid
          puzzle={puzzle}
          state={state}
          selected={selected}
          accent={playAccent}
          accentSoft={playAccentSoft}
          onSelect={setSelected}
          muted={false}
          interactive
        />
      </div>
      {state.n === 16 && (
        <p className="sm:hidden mt-3 text-center text-[11px]" style={{ color: "var(--color-ink-mute)" }}>
          16×16 is best on a larger screen.
        </p>
      )}

      {isSolved && (
        <div
          className="mt-5 rounded-lg p-4 text-center relative"
          style={{ background: playAccentSoft, color: playAccent }}
        >
          {outcome?.newPersonalBest && (
            <span
              className="absolute top-2 right-2 text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ background: playAccent, color: "white", fontWeight: 600 }}
            >
              New best
            </span>
          )}
          <div className="text-base" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
            Solved. Quietly done.
          </div>
          {isSolved && (
            <div className="mt-1 text-xs" style={{ color: playAccent, opacity: 0.85 }}>
              {formatTime(elapsedSeconds)} · {mistakes} mistake{mistakes === 1 ? "" : "s"}
            </div>
          )}
          {outcome && (outcome.newFastestTime || outcome.newFewestMistakes) && !outcome.newPersonalBest && (
            <div className="mt-1 text-[10px] italic" style={{ color: playAccent, opacity: 0.75 }}>
              {[
                outcome.newFastestTime ? "fastest time" : null,
                outcome.newFewestMistakes ? "fewest mistakes" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>
      )}

      <NumberPad
        n={n}
        accent={playAccent}
        notesMode={notesMode}
        onDigit={(d) => {
          if (selected === null) return;
          if (notesMode) handleToggleNote(selected, d);
          else handlePlace(selected, d);
        }}
        onClear={() => selected !== null && handleClear(selected)}
        onToggleNotes={() => setNotesMode((m) => !m)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAutoPencil={handleAutoPencil}
        onClearAllNotes={handleClearAllNotes}
        canUndo={historyIdx > 0}
        canRedo={historyIdx < history.length - 1}
      />

      <div
        className="mt-4 flex items-start justify-between gap-3 text-[11px] leading-relaxed"
        style={{ color: "var(--color-ink-mute)" }}
      >
        <div className="flex flex-col gap-0.5">
          {notesMode ? (
            <>
              <span style={{ color: "var(--color-ink-soft)" }}>
                <strong style={{ color: playAccent }}>Notes are ON.</strong> Typing 1–{n} writes small
                candidate digits in the selected cell instead of placing a value.
              </span>
              <span>Turn off with the Notes button or press N.</span>
            </>
          ) : selected === null ? (
            <>
              <span>
                Click a cell, then type 1–{n} to fill it. <strong>Notes</strong> mode (or Shift+digit)
                writes small pencil-mark candidates.
              </span>
              <span>Shortcuts: <kbd style={kbd}>N</kbd> notes · <kbd style={kbd}>⌘Z</kbd> undo · arrows navigate</span>
            </>
          ) : (
            <>
              <span>
                <strong>1–{n}</strong> places a value · <strong>Shift+digit</strong> toggles a note ·{" "}
                <strong>⌫</strong> clears
              </span>
              <span>Toggle Notes mode for pen-and-paper-style candidates · <kbd style={kbd}>⌘Z</kbd> undo</span>
            </>
          )}
        </div>
        <button
          onClick={onToggleSolution}
          className="underline-offset-4 hover:underline transition-colors text-xs shrink-0"
          style={{ color: "var(--color-ink-soft)" }}
        >
          {showSolution ? "Hide solution" : "Show solution"}
        </button>
      </div>

      {elapsedMs !== null && (
        <div className="mt-1 text-[10px] opacity-50" style={{ color: "var(--color-ink-mute)" }}>
          generated in {elapsedMs} ms
        </div>
      )}

      {showSolution && (
        <div className="mt-5 pt-5 flex justify-center" style={{ borderTop: "1px solid var(--color-divider)" }}>
          <Grid
            puzzle={{ ...puzzle, givens: puzzle.solution }}
            state={initialState(puzzle.solution)}
            selected={null}
            accent={playAccent}
            accentSoft={playAccentSoft}
            onSelect={() => {}}
            muted
          />
        </div>
      )}

      <div className="mt-6 rounded-full h-[3px]" style={{ background: variantAccentSoft }} />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  active,
}: {
  label: string;
  value: string;
  accent: string;
  active?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {active && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: accent, animation: "stillgrid-pulse 1.5s ease-in-out infinite" }}
        />
      )}
      <span style={{ color: accent, fontWeight: 600 }}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-mute)" }}>
        {label}
      </span>
    </span>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function TierBadge({ tier, steps }: { tier: string; steps: number }) {
  const c = TIER_COLOR[tier];
  if (!c) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: c.soft, color: c.main }}>
      <span className="capitalize">{tier}</span>
      <span style={{ opacity: 0.7 }}>· {steps} steps</span>
    </span>
  );
}

function NotesGrid({
  n,
  notes,
  highlightDigit,
}: {
  n: number;
  notes: number[];
  highlightDigit: number | null;
}) {
  const set = new Set(notes);
  const bw = boxDims(n).bw;
  const rows = Math.ceil(n / bw);
  return (
    <div
      className="grid w-full h-full p-0.5"
      style={{ gridTemplateColumns: `repeat(${bw}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
    >
      {Array.from({ length: n }, (_, k) => k + 1).map((d) => {
        const present = set.has(d);
        const hl = highlightDigit === d && present;
        return (
          <span
            key={d}
            className="flex items-center justify-center leading-none"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: n === 16 ? 6 : 9,
              fontWeight: hl ? 700 : 500,
              color: present
                ? hl
                  ? "var(--color-ink)"
                  : "var(--color-ink-mute)"
                : "transparent",
            }}
          >
            {digitToChar(d)}
          </span>
        );
      })}
    </div>
  );
}

function NumberPad({
  n,
  accent,
  notesMode,
  onDigit,
  onClear,
  onToggleNotes,
  onUndo,
  onRedo,
  onAutoPencil,
  onClearAllNotes,
  canUndo,
  canRedo,
}: {
  n: number;
  accent: string;
  notesMode: boolean;
  onDigit: (d: number) => void;
  onClear: () => void;
  onToggleNotes: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAutoPencil: () => void;
  onClearAllNotes: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  // Both rows use the same gap and the same button height so they read as
  // a single control surface.
  const ROW_GAP = "gap-2";
  const BTN_H = 44; // px — matches the digit buttons exactly

  return (
    <div className={`mt-6 flex flex-col items-center ${ROW_GAP} w-full`}>
      {/* tool row: Notes (prominent toggle) · Auto-fill · Clear notes · Undo · Redo.
          Mobile: Notes spans full width, the four utilities sit in a 4-up icon
          grid below it. Desktop: everything collapses into one centered row. */}
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-center sm:flex-wrap w-full mx-auto ${ROW_GAP}`}>
        <button
          onClick={onToggleNotes}
          title={`Toggle notes mode (N). When on, 1-${n} writes small candidate digits instead of placing a value.`}
          className="inline-flex items-center justify-center gap-2 px-2 sm:px-4 rounded-lg text-sm transition-colors w-full sm:w-auto"
          style={{
            height: BTN_H,
            background: notesMode ? accent : "var(--color-paper)",
            color: notesMode ? "white" : "var(--color-ink-soft)",
            border: notesMode ? `1px solid ${accent}` : "1px solid var(--color-divider)",
            fontWeight: 500,
          }}
        >
          <PencilIcon />
          <span>Notes</span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wider"
            style={{
              background: notesMode ? "rgba(255,255,255,0.25)" : "var(--color-divider)",
              color: notesMode ? "white" : "var(--color-ink-mute)",
              fontWeight: 600,
            }}
          >
            {notesMode ? "On" : "Off"}
          </span>
        </button>

        <div className={`grid grid-cols-4 sm:contents ${ROW_GAP}`}>
          <ToolButton h={BTN_H} accent={accent} onClick={onAutoPencil} title="Fill every empty cell with valid candidates">
            <SparkleIcon />
            <span className="hidden sm:inline">Auto-fill</span>
          </ToolButton>
          <ToolButton h={BTN_H} accent={accent} onClick={onClearAllNotes} title="Erase all notes from every cell (values stay)">
            <EraserIcon />
            <span className="hidden sm:inline">Clear notes</span>
          </ToolButton>
          <ToolButton h={BTN_H} accent={accent} onClick={onUndo} disabled={!canUndo} title="Undo last move (⌘Z)">
            <UndoIcon />
            <span className="hidden sm:inline">Undo</span>
          </ToolButton>
          <ToolButton h={BTN_H} accent={accent} onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)">
            <RedoIcon />
            <span className="hidden sm:inline">Redo</span>
          </ToolButton>
        </div>
      </div>

      {/* digit row — n digits + 1 clear = n+1 buttons. Mobile: half-width rows; desktop: single row. */}
      <div
        className={`grid w-full sm:max-w-[512px] mx-auto ${ROW_GAP}`}
        style={{ gridTemplateColumns: `repeat(${n + 1}, 1fr)` }}
      >
        {Array.from({ length: n }, (_, k) => k + 1).map((d) => (
          <button
            key={d}
            onClick={() => onDigit(d)}
            className="rounded-md text-lg transition-colors w-full"
            style={{
              height: BTN_H,
              background: notesMode ? "var(--color-card)" : "var(--color-paper)",
              border: notesMode ? `1px dashed ${accent}` : "1px solid var(--color-divider)",
              color: accent,
              fontFamily: "var(--font-display)",
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-divider)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = notesMode
                ? "var(--color-card)"
                : "var(--color-paper)";
            }}
          >
            {digitToChar(d)}
          </button>
        ))}
        <button
          onClick={onClear}
          title="Clear the selected cell (Backspace)"
          className="rounded-md text-sm transition-colors flex items-center justify-center w-full"
          style={{
            height: BTN_H,
            background: "var(--color-paper)",
            color: "var(--color-ink-soft)",
            border: "1px solid var(--color-divider)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-divider)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-paper)";
          }}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  accent,
  onClick,
  disabled,
  title,
  h = 36,
  children,
}: {
  active?: boolean;
  accent: string;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  h?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 rounded-lg text-sm transition-colors w-full sm:w-auto"
      style={{
        height: h,
        background: active ? accent : "var(--color-paper)",
        color: active ? "white" : disabled ? "var(--color-ink-mute)" : "var(--color-ink-soft)",
        border: "1px solid var(--color-divider)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

function PencilIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path
        d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path
        d="M9.5 1.5L14.5 6.5L7.5 13.5H3L1.5 12L9.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M6 5L11 10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 7H10C12.2 7 14 8.8 14 11C14 13.2 12.2 15 10 15H6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 3L2.5 7L6 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ transform: "scaleX(-1)" }}>
      <path
        d="M3 7H10C12.2 7 14 8.8 14 11C14 13.2 12.2 15 10 15H6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 3L2.5 7L6 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// --- Grid ----------------------------------------------------------------

function Grid({
  puzzle,
  state,
  selected,
  accent,
  accentSoft,
  onSelect,
  muted,
  interactive,
}: {
  puzzle: PuzzleResponse;
  state: BoardState;
  selected: number | null;
  accent: string;
  accentSoft: string;
  onSelect: (i: number) => void;
  muted: boolean;
  interactive?: boolean;
}) {
  const n = state.n;
  const cells = n * n;
  const cellMin = n === 16 ? 18 : 34;
  const cellMax = n === 16 ? 34 : 46;
  const valueFont = n === 16 ? 15 : 22;
  const cageOf: (number | null)[] = Array(cells).fill(null);
  if (puzzle.cages) {
    puzzle.cages.forEach((cage, ci) => cage.cells.forEach((c) => (cageOf[c] = ci)));
  }
  const cageSumAt = new Map<number, number>();
  if (puzzle.cages) {
    puzzle.cages.forEach((cage) => {
      const topLeft = cage.cells.reduce((a, b) => Math.min(a, b), cells);
      cageSumAt.set(topLeft, cage.sum);
    });
  }
  const boxOf = puzzle.box_of ?? defaultBoxOf(n);

  const selRow = selected !== null ? Math.floor(selected / n) : -1;
  const selCol = selected !== null ? selected % n : -1;
  const selBox = selected !== null ? boxOf[selected] : -1;
  const selDigit = selected !== null ? getValue(state, selected) || null : null;

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${n}, minmax(${cellMin}px, ${cellMax}px))`,
        gridTemplateRows: `repeat(${n}, minmax(${cellMin}px, ${cellMax}px))`,
        border: "2px solid var(--color-box-line)",
        borderRadius: 4,
        overflow: "hidden",
        background: "var(--color-card)",
        userSelect: "none",
      }}
    >
      {Array.from({ length: cells }, (_, i) => {
        const row = Math.floor(i / n);
        const col = i % n;
        const given = state.givenMask[i] === 1;
        const value = state.values[i] ?? 0;
        const valueChar = value === 0 ? "" : digitToChar(value);
        const notes = value === 0 ? listNotes(state, i) : [];

        const sumHere = cageSumAt.get(i);
        const myBox = boxOf[i];

        const isSelected = i === selected;
        const isPeer =
          !isSelected &&
          selected !== null &&
          (row === selRow || col === selCol || myBox === selBox);
        const isSameDigit =
          !isSelected && selDigit !== null && value !== 0 && value === selDigit;

        const expected = charToDigit(puzzle.solution[i] ?? "");
        const isConflict = !given && value !== 0 && value !== expected;

        let bg: string | undefined;
        if (puzzle.diagonals && (row === col || row + col === n - 1)) {
          bg = "var(--color-diagonal)";
        }
        if (isPeer) bg = accentSoft;
        if (isSameDigit) bg = "var(--color-paper)";
        if (isSelected) bg = accentSoft;
        // A wrong entry gets its own wash so it can't be mistaken for a correct
        // value under the terracotta accent (Hard / Killer). Wins over selection.
        if (isConflict) bg = "var(--color-error-soft)";

        // cell borders
        const rightIdx = col < n - 1 ? i + 1 : null;
        const bottomIdx = row < n - 1 ? i + n : null;
        const borderRight =
          col === n - 1
            ? "none"
            : rightIdx !== null && boxOf[rightIdx] !== myBox
              ? "2px solid var(--color-box-line)"
              : "1px solid var(--color-cell-line)";
        const borderBottom =
          row === n - 1
            ? "none"
            : bottomIdx !== null && boxOf[bottomIdx] !== myBox
              ? "2px solid var(--color-box-line)"
              : "1px solid var(--color-cell-line)";

        // killer cage borders
        const cageInsets: string[] = [];
        if (puzzle.cages) {
          const myCage = cageOf[i];
          const above = row > 0 ? cageOf[i - n] : null;
          const left = col > 0 ? cageOf[i - 1] : null;
          const right = col < n - 1 ? cageOf[i + 1] : null;
          const below = row < n - 1 ? cageOf[i + n] : null;
          const c = "var(--color-cage)";
          if (above !== myCage) cageInsets.push(`inset 0 2px 0 -1px ${c}`);
          if (left !== myCage) cageInsets.push(`inset 2px 0 0 -1px ${c}`);
          if (right !== myCage) cageInsets.push(`inset -2px 0 0 -1px ${c}`);
          if (below !== myCage) cageInsets.push(`inset 0 -2px 0 -1px ${c}`);
        }

        // selected ring (visible inset)
        const allInsets = [...cageInsets];
        if (isSelected) {
          allInsets.push(`inset 0 0 0 2px ${isConflict ? "var(--color-error)" : accent}`);
        }

        let textColor = "var(--color-ink)";
        if (muted) textColor = "var(--color-ink-mute)";
        else if (!given && value !== 0) {
          textColor = isConflict ? "var(--color-error)" : accent;
        }

        return (
          <div
            key={i}
            role={interactive ? "button" : undefined}
            onClick={interactive ? () => onSelect(i) : undefined}
            className="relative flex items-center justify-center transition-colors"
            style={{
              background: bg,
              borderRight,
              borderBottom,
              boxShadow: allInsets.join(", ") || undefined,
              fontFamily: "var(--font-grid)",
              fontSize: valueFont,
              fontWeight: given ? 500 : 600,
              color: textColor,
              cursor: interactive ? "pointer" : "default",
            }}
          >
            {sumHere !== undefined && (
              <span
                className="absolute top-[2px] left-[3px] leading-none"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 9,
                  fontWeight: 600,
                  color: "var(--color-cage)",
                }}
              >
                {sumHere}
              </span>
            )}
            {valueChar ? (
              valueChar
            ) : notes.length > 0 ? (
              <NotesGrid n={n} notes={notes} highlightDigit={selDigit} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// --- sidebar -------------------------------------------------------------

function SidebarCard({
  accent,
  title,
  tag,
  children,
}: {
  accent: string;
  title: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--color-card)", boxShadow: "var(--shadow-soft)", borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm" style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: accent }}>{title}</h3>
        {tag && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "var(--color-paper)", color: "var(--color-ink-mute)" }}>
            {tag}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function DailyCard({ onPlay }: { onPlay: (kind: "classic" | "killer") => void }) {
  const date = todayKey();
  const niceDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const [done, setDone] = useState(getDailyDone(date));
  useEffect(() => {
    const handler = () => setDone(getDailyDone(date));
    window.addEventListener("stillgrid:dailyDone", handler);
    return () => window.removeEventListener("stillgrid:dailyDone", handler);
  }, [date]);

  const Row = ({
    kind,
    accent,
    label,
  }: {
    kind: "classic" | "killer";
    accent: string;
    label: string;
  }) => {
    const completed = done[kind];
    return (
      <button
        onClick={() => onPlay(kind)}
        className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-md transition-colors text-left text-xs"
        style={{
          background: completed ? "var(--color-paper)" : "transparent",
          color: "var(--color-ink-soft)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--color-paper)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = completed
            ? "var(--color-paper)"
            : "transparent";
        }}
      >
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
          <span style={{ color: "var(--color-ink)" }}>{label}</span>
        </span>
        <span className="flex items-center gap-1">
          {completed ? (
            <>
              <CheckIcon color={accent} />
              <span style={{ color: accent, fontWeight: 600 }}>
                {Math.floor(completed.timeSec / 60)}:
                {String(completed.timeSec % 60).padStart(2, "0")}
              </span>
            </>
          ) : (
            <span style={{ color: "var(--color-ink-mute)" }}>Play →</span>
          )}
        </span>
      </button>
    );
  };

  return (
    <SidebarCard accent="var(--color-sage)" title="Daily" tag={niceDate}>
      <p className="text-[11px] leading-relaxed mb-2" style={{ color: "var(--color-ink-mute)" }}>
        Same two puzzles for everyone, every day.
      </p>
      <div className="flex flex-col gap-0.5">
        <Row kind="classic" accent="var(--color-sage)" label="Today's Classic" />
        <Row kind="killer" accent="var(--color-terracotta)" label="Today's Killer" />
      </div>
    </SidebarCard>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8.5L6.5 12L13 4.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StreakCard() {
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    const refresh = () => setStreak(getStreak());
    refresh();
    window.addEventListener("stillgrid:dailyDone", refresh);
    return () => window.removeEventListener("stillgrid:dailyDone", refresh);
  }, []);

  return (
    <SidebarCard accent="var(--color-medium)" title="Your streak">
      <div className="flex items-baseline gap-2">
        <span
          className="text-3xl tabular-nums"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            color: streak > 0 ? "var(--color-medium)" : "var(--color-ink-mute)",
          }}
        >
          {streak}
        </span>
        <span className="text-xs" style={{ color: "var(--color-ink-soft)" }}>
          day{streak === 1 ? "" : "s"}
        </span>
      </div>
      <p className="text-[11px] mt-1" style={{ color: "var(--color-ink-mute)" }}>
        {streak === 0
          ? "Solve a puzzle each day to start your streak."
          : streak === 1
            ? "Keep it going tomorrow."
            : "Don't let it slip — come back tomorrow."}
      </p>
    </SidebarCard>
  );
}

function VariantsCard({ active, onPick }: { active: Variant; onPick: (v: Variant) => void }) {
  const variants: Variant[] = ["classic", "xsudoku", "jigsaw", "killer"];
  return (
    <SidebarCard accent="var(--color-plum)" title="Variants">
      <div className="flex flex-col gap-1">
        {variants.map((v) => {
          const c = VARIANT_COLOR[v];
          const isActive = v === active;
          return (
            <button
              key={v}
              onClick={() => onPick(v)}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md transition-colors text-left text-xs"
              style={{ background: isActive ? c.soft : "transparent", color: isActive ? c.main : "var(--color-ink-soft)" }}
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: c.main }} />
                <span style={{ fontWeight: isActive ? 600 : 400 }}>{c.label}</span>
              </span>
              {isActive && <span className="text-[10px]">●</span>}
            </button>
          );
        })}
      </div>
    </SidebarCard>
  );
}

function RoadmapCard() {
  const items = [
    { label: "Scoring + leaderboards", when: "Phase 2", color: "var(--color-sage)" },
    { label: "Daily challenge + streaks", when: "Phase 2", color: "var(--color-teal)" },
    { label: "Mini 6×6, 16×16", when: "Phase 2", color: "var(--color-plum)" },
    { label: "Print pack (weekly PDF)", when: "Phase 2", color: "var(--color-medium)" },
    { label: "Technique guides", when: "Phase 3", color: "var(--color-terracotta)" },
    { label: "Multilingual (6 langs)", when: "Phase 3", color: "var(--color-ink-soft)" },
  ];
  return (
    <SidebarCard accent="var(--color-terracotta)" title="What's coming" tag="Roadmap">
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: it.color }} />
            <span style={{ color: "var(--color-ink-soft)" }}>{it.label}</span>
            <span className="ml-auto text-[10px]" style={{ color: "var(--color-ink-mute)" }}>{it.when}</span>
          </li>
        ))}
      </ul>
    </SidebarCard>
  );
}

// Feedletter feedback widget. widget.js binds to #feedletter-widget-button and
// reads the global feedletterFormId. We inject it after mount (so the button
// exists) and guard against StrictMode's double-invoke via the script id.
// PROD-only, mirroring analytics + the service worker: keeps localhost dev
// submissions out of the real Feedletter inbox.
const FEEDLETTER_FORM_ID = "8a74122c-7f70-4291-99b1-b7a5847741cd";

function useFeedletterWidget() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    (window as unknown as { feedletterFormId?: string }).feedletterFormId = FEEDLETTER_FORM_ID;
    if (document.getElementById("feedletter-widget-script")) return;
    const s = document.createElement("script");
    s.id = "feedletter-widget-script";
    s.src = "https://feedletter.co/embed/widget.js";
    s.defer = true;
    document.body.appendChild(s);
  }, []);
}

function Footer({ isDemo }: { isDemo: boolean }) {
  useFeedletterWidget();
  return (
    <footer className="border-t mt-8" style={{ borderColor: "var(--color-divider)" }}>
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-xs" style={{ color: "var(--color-ink-mute)" }}>
        <span>© {new Date().getFullYear()} Stillgrid. Made with patience.</span>
        <div className="flex items-center gap-4">
          {isDemo && <span className="italic">Demo build · pool of pre-baked puzzles</span>}
          <a href="#" className="hover:underline">About</a>
          <a href="#" className="hover:underline">Contact</a>
          {import.meta.env.PROD && (
            <button id="feedletter-widget-button" className="hover:underline cursor-pointer">
              Feedback
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}

