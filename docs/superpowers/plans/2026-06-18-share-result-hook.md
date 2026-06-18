# Share-result Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Wordle-style "share your result" button to the win panel that copies/shares a spoiler-free stat line with a deep link, so solves spread and bring new players in.

**Architecture:** A new pure module `web/src/share.ts` owns the text formatting (`buildShareText`), the deep-link parser (`parseEntryParam`), and the navigator/clipboard branching (`shareResult` → returns a method string, no React). `web/src/App.tsx` renders a quiet Share button in the existing "Solved." panel and reads the entry param on mount. One new Plausible event (`puzzle_shared`). All formatting/parsing is unit-tested; the React wiring is verified by `tsc -b` + lint + manual check (the codebase has no component-render test harness).

**Tech Stack:** React 18 + TypeScript (strict, `noUncheckedIndexedAccess`), Vitest (jsdom env), Tailwind v4, Plausible analytics.

**Spec:** `docs/superpowers/specs/2026-06-18-share-result-hook-design.md`

**All commands run from the `web/` directory unless noted.**

---

## File Structure

- **`web/src/share.ts`** (new) — pure share logic. Exports: `ShareVariant`, `ShareInput`, `EntryParam`, `ShareMethod`, `buildShareText`, `parseEntryParam`, `shareResult`. One responsibility: turn a solve into shareable text + perform the share. No React, no App imports.
- **`web/src/share.test.ts`** (new) — unit tests for the three exported functions.
- **`web/src/analytics.ts`** (modify) — add `"puzzle_shared"` to the `EventName` union.
- **`web/src/App.tsx`** (modify) — import from `./share`; render the Share button + `handleShare`/`copied` state in `PlayCard`; act on the entry param in the mount effect.
- **`docs/superpowers/specs/2026-05-25-plausible-integration-design.md`** (modify) — add the `puzzle_shared` taxonomy row.
- **`CLAUDE.md`** (modify) — bump "Six custom events" → seven and list `puzzle_shared`.

---

## Task 1: `share.ts` — `buildShareText`

**Files:**
- Create: `web/src/share.ts`
- Test: `web/src/share.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/share.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildShareText } from "./share";

const ORIGIN = "https://stillgrid.app";

describe("buildShareText", () => {
  it("formats a daily Killer (Medium) solve", () => {
    const r = buildShareText({
      variant: "killer", size: 9, tier: "medium", timeSec: 252,
      mistakes: 0, streak: 7, isDaily: true, date: "2026-06-18", origin: ORIGIN,
    });
    expect(r.body).toBe("🟧 Stillgrid Daily · Killer · Jun 18\n🟩🟩⬜⬜⬜ Medium · 4:12 · no mistakes · 🔥7");
    expect(r.url).toBe("https://stillgrid.app/?d=killer");
    expect(r.full).toBe(r.body + "\n" + r.url);
  });

  it("formats a casual Jigsaw (Nightmare) solve", () => {
    const r = buildShareText({
      variant: "jigsaw", size: 9, tier: "nightmare", timeSec: 252,
      mistakes: 0, streak: 3, isDaily: false, date: "", origin: ORIGIN,
    });
    expect(r.body).toBe("🟪 Stillgrid · Jigsaw\n🟩🟩🟩🟩🟩 Nightmare · 4:12 · no mistakes · 🔥3");
    expect(r.url).toBe("https://stillgrid.app/?v=jigsaw");
  });

  it("uses the variant square for each variant", () => {
    const sq = (variant: "classic" | "xsudoku" | "jigsaw" | "killer") =>
      buildShareText({ variant, size: 9, tier: "easy", timeSec: 60, mistakes: 0, streak: 0, isDaily: false, date: "", origin: ORIGIN }).body[0];
    expect(sq("classic")).toBe("🟩");
    expect(sq("xsudoku")).toBe("🟦");
    expect(sq("killer")).toBe("🟧");
    expect(sq("jigsaw")).toBe("🟪");
  });

  it("maps each tier to the right pip row + name", () => {
    const line2 = (tier: string) =>
      buildShareText({ variant: "classic", size: 9, tier, timeSec: 60, mistakes: 0, streak: 0, isDaily: false, date: "", origin: ORIGIN }).body.split("\n")[1];
    expect(line2("easy")).toBe("🟩⬜⬜⬜⬜ Easy · 1:00 · no mistakes");
    expect(line2("medium")).toBe("🟩🟩⬜⬜⬜ Medium · 1:00 · no mistakes");
    expect(line2("hard")).toBe("🟩🟩🟩⬜⬜ Hard · 1:00 · no mistakes");
    expect(line2("diabolical")).toBe("🟩🟩🟩🟩⬜ Diabolical · 1:00 · no mistakes");
    expect(line2("nightmare")).toBe("🟩🟩🟩🟩🟩 Nightmare · 1:00 · no mistakes");
  });

  it("treats an unknown/stuck tier as easy", () => {
    const r = buildShareText({ variant: "classic", size: 9, tier: "stuck", timeSec: 60, mistakes: 0, streak: 0, isDaily: false, date: "", origin: ORIGIN });
    expect(r.body.split("\n")[1]).toBe("🟩⬜⬜⬜⬜ Easy · 1:00 · no mistakes");
  });

  it("adds a size suffix only when size != 9", () => {
    const label = (size: number) =>
      buildShareText({ variant: "classic", size, tier: "easy", timeSec: 60, mistakes: 0, streak: 0, isDaily: false, date: "", origin: ORIGIN }).body.split("\n")[0];
    expect(label(9)).toBe("🟩 Stillgrid · Classic");
    expect(label(6)).toBe("🟩 Stillgrid · Classic 6×6");
    expect(label(16)).toBe("🟩 Stillgrid · Classic 16×16");
  });

  it("pluralizes mistakes and hides the streak below 2", () => {
    const line2 = (mistakes: number, streak: number) =>
      buildShareText({ variant: "classic", size: 9, tier: "easy", timeSec: 65, mistakes, streak, isDaily: false, date: "", origin: ORIGIN }).body.split("\n")[1];
    expect(line2(0, 0)).toBe("🟩⬜⬜⬜⬜ Easy · 1:05 · no mistakes");
    expect(line2(1, 1)).toBe("🟩⬜⬜⬜⬜ Easy · 1:05 · 1 mistake");
    expect(line2(2, 2)).toBe("🟩⬜⬜⬜⬜ Easy · 1:05 · 2 mistakes · 🔥2");
  });

  it("uses ?d= for daily and ?v= for casual", () => {
    expect(buildShareText({ variant: "classic", size: 9, tier: "easy", timeSec: 60, mistakes: 0, streak: 0, isDaily: true, date: "2026-06-18", origin: ORIGIN }).url).toBe("https://stillgrid.app/?d=classic");
    expect(buildShareText({ variant: "classic", size: 9, tier: "easy", timeSec: 60, mistakes: 0, streak: 0, isDaily: false, date: "", origin: ORIGIN }).url).toBe("https://stillgrid.app/?v=classic");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/share.test.ts`
Expected: FAIL — `Failed to resolve import "./share"` (file does not exist yet).

- [ ] **Step 3: Implement `buildShareText`**

Create `web/src/share.ts`:

```ts
export type ShareVariant = "classic" | "xsudoku" | "jigsaw" | "killer";

export interface ShareInput {
  variant: ShareVariant;
  size: number;
  tier: string; // graded tier_label; unknown/stuck falls back to "easy"
  timeSec: number;
  mistakes: number;
  streak: number;
  isDaily: boolean;
  date: string; // "YYYY-MM-DD"; used only when isDaily
  origin: string; // e.g. "https://stillgrid.app"
}

const SQUARE: Record<ShareVariant, string> = {
  classic: "🟩",
  xsudoku: "🟦",
  killer: "🟧",
  jigsaw: "🟪",
};

const LABEL: Record<ShareVariant, string> = {
  classic: "Classic",
  xsudoku: "X-Sudoku",
  jigsaw: "Jigsaw",
  killer: "Killer",
};

const PIPS: Record<string, string> = {
  easy: "🟩⬜⬜⬜⬜",
  medium: "🟩🟩⬜⬜⬜",
  hard: "🟩🟩🟩⬜⬜",
  diabolical: "🟩🟩🟩🟩⬜",
  nightmare: "🟩🟩🟩🟩🟩",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function mmss(timeSec: number): string {
  const m = Math.floor(timeSec / 60);
  const s = timeSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// "2026-06-18" -> "Jun 18". Parsed by hand to avoid Date() timezone drift;
// returns the input unchanged if it isn't an ISO date.
function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1] ?? "";
  const day = Number(m[3]);
  return `${month} ${day}`.trim();
}

function mistakesPhrase(n: number): string {
  if (n === 0) return "no mistakes";
  if (n === 1) return "1 mistake";
  return `${n} mistakes`;
}

export function buildShareText(input: ShareInput): { body: string; url: string; full: string } {
  const tierKey = PIPS[input.tier] ? input.tier : "easy";
  const pips = PIPS[tierKey]!;
  const tierCap = tierKey.charAt(0).toUpperCase() + tierKey.slice(1);
  const square = SQUARE[input.variant];
  const label = LABEL[input.variant];
  const sizeSuffix = input.size === 9 ? "" : ` ${input.size}×${input.size}`;
  const datePart = input.isDaily ? ` · ${prettyDate(input.date)}` : "";
  const dailyWord = input.isDaily ? " Daily" : "";
  const streakPart = input.streak >= 2 ? ` · 🔥${input.streak}` : "";

  const line1 = `${square} Stillgrid${dailyWord} · ${label}${sizeSuffix}${datePart}`;
  const line2 = `${pips} ${tierCap} · ${mmss(input.timeSec)} · ${mistakesPhrase(input.mistakes)}${streakPart}`;
  const url = `${input.origin}${input.isDaily ? `/?d=${input.variant}` : `/?v=${input.variant}`}`;
  const body = `${line1}\n${line2}`;
  return { body, url, full: `${body}\n${url}` };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/share.test.ts`
Expected: PASS (8 tests in the `buildShareText` describe).

- [ ] **Step 5: Commit**

```bash
git add web/src/share.ts web/src/share.test.ts
git commit -m "feat(share): buildShareText result formatter"
```

---

## Task 2: `share.ts` — `parseEntryParam`

**Files:**
- Modify: `web/src/share.ts`
- Test: `web/src/share.test.ts`

- [ ] **Step 1: Write the failing test**

First extend the existing `./share` import at the top of `web/src/share.test.ts` from `import { buildShareText } from "./share";` to:

```ts
import { buildShareText, parseEntryParam } from "./share";
```

Then append this block to the end of `web/src/share.test.ts` (no new import line):

```ts
describe("parseEntryParam", () => {
  it("parses a valid daily param", () => {
    expect(parseEntryParam("?d=classic")).toEqual({ mode: "daily", variant: "classic" });
    expect(parseEntryParam("?d=killer")).toEqual({ mode: "daily", variant: "killer" });
  });

  it("rejects a daily param for a variant with no daily", () => {
    expect(parseEntryParam("?d=jigsaw")).toBeNull();
    expect(parseEntryParam("?d=xsudoku")).toBeNull();
  });

  it("parses a valid casual param for every variant", () => {
    expect(parseEntryParam("?v=classic")).toEqual({ mode: "casual", variant: "classic" });
    expect(parseEntryParam("?v=xsudoku")).toEqual({ mode: "casual", variant: "xsudoku" });
    expect(parseEntryParam("?v=jigsaw")).toEqual({ mode: "casual", variant: "jigsaw" });
    expect(parseEntryParam("?v=killer")).toEqual({ mode: "casual", variant: "killer" });
  });

  it("prefers daily when both are present", () => {
    expect(parseEntryParam("?d=classic&v=jigsaw")).toEqual({ mode: "daily", variant: "classic" });
  });

  it("returns null for unknown/empty/garbage", () => {
    expect(parseEntryParam("?v=foo")).toBeNull();
    expect(parseEntryParam("?size=9")).toBeNull();
    expect(parseEntryParam("")).toBeNull();
    expect(parseEntryParam("?d=")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/share.test.ts`
Expected: FAIL — `parseEntryParam is not a function` / no matching export.

- [ ] **Step 3: Implement `parseEntryParam`**

Append to `web/src/share.ts`:

```ts
export type EntryParam =
  | { mode: "daily"; variant: "classic" | "killer" }
  | { mode: "casual"; variant: ShareVariant };

const DAILY_VARIANTS = ["classic", "killer"] as const;
const CASUAL_VARIANTS = ["classic", "xsudoku", "jigsaw", "killer"] as const;

export function parseEntryParam(search: string): EntryParam | null {
  const params = new URLSearchParams(search);
  const d = params.get("d");
  if (d && (DAILY_VARIANTS as readonly string[]).includes(d)) {
    return { mode: "daily", variant: d as "classic" | "killer" };
  }
  const v = params.get("v");
  if (v && (CASUAL_VARIANTS as readonly string[]).includes(v)) {
    return { mode: "casual", variant: v as ShareVariant };
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/share.test.ts`
Expected: PASS (both describes green).

- [ ] **Step 5: Commit**

```bash
git add web/src/share.ts web/src/share.test.ts
git commit -m "feat(share): parseEntryParam deep-link reader"
```

---

## Task 3: `share.ts` — `shareResult`

**Files:**
- Modify: `web/src/share.ts`
- Test: `web/src/share.test.ts`

- [ ] **Step 1: Write the failing test**

First extend the two existing imports at the top of `web/src/share.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { buildShareText, parseEntryParam, shareResult } from "./share";
```

Then append this block to the end of `web/src/share.test.ts` (no new import line):

```ts
describe("shareResult", () => {
  const parts = { body: "L1\nL2", url: "https://stillgrid.app/?v=classic", full: "L1\nL2\nhttps://stillgrid.app/?v=classic" };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the Web Share API when available and reports 'native'", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    const method = await shareResult(parts);

    expect(method).toBe("native");
    expect(share).toHaveBeenCalledWith({ text: parts.body, url: parts.url });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("reports 'cancelled' and does NOT copy when the user dismisses the share sheet", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("dismissed", "AbortError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    const method = await shareResult(parts);

    expect(method).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when share throws a non-abort error", async () => {
    const share = vi.fn().mockRejectedValue(new Error("boom"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });

    const method = await shareResult(parts);

    expect(method).toBe("clipboard");
    expect(writeText).toHaveBeenCalledWith(parts.full);
  });

  it("copies to clipboard when there is no Web Share API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const method = await shareResult(parts);

    expect(method).toBe("clipboard");
    expect(writeText).toHaveBeenCalledWith(parts.full);
  });

  it("falls back to a prompt and reports 'manual' when neither API exists", async () => {
    const prompt = vi.fn();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("prompt", prompt);

    const method = await shareResult(parts);

    expect(method).toBe("manual");
    expect(prompt).toHaveBeenCalledWith("Copy your result:", parts.full);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/share.test.ts`
Expected: FAIL — `shareResult is not a function`.

- [ ] **Step 3: Implement `shareResult`**

Append to `web/src/share.ts`:

```ts
export type ShareMethod = "native" | "clipboard" | "manual" | "cancelled";

// Performs the share with progressive enhancement and reports which path ran.
// Side-effect-light: the caller owns the UI feedback + analytics based on the
// returned method. "cancelled" = user dismissed the native sheet (no-op).
export async function shareResult(parts: { body: string; url: string; full: string }): Promise<ShareMethod> {
  const nav: Navigator | undefined = typeof navigator !== "undefined" ? navigator : undefined;

  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({ text: parts.body, url: parts.url });
      return "native";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // any other error → fall through to clipboard
    }
  }

  if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
    try {
      await nav.clipboard.writeText(parts.full);
      return "clipboard";
    } catch {
      // fall through to manual
    }
  }

  if (typeof prompt === "function") {
    prompt("Copy your result:", parts.full);
  }
  return "manual";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/share.test.ts`
Expected: PASS (all three describes).

- [ ] **Step 5: Commit**

```bash
git add web/src/share.ts web/src/share.test.ts
git commit -m "feat(share): shareResult (Web Share API + clipboard fallback)"
```

---

## Task 4: `analytics.ts` — add `puzzle_shared` event

**Files:**
- Modify: `web/src/analytics.ts:1-7`
- Test: `web/src/analytics.test.ts`

- [ ] **Step 1: Write the failing test**

Append a new test inside the `describe("in production (PROD=true)", ...)` block in `web/src/analytics.test.ts` (after the existing `"calls window.plausible with no opts..."` test, before that block's closing `});`):

```ts
    it("forwards puzzle_shared props", async () => {
      const plausibleSpy = vi.fn();
      (window as { plausible?: unknown }).plausible = plausibleSpy;
      const { track } = await import("./analytics");

      track("puzzle_shared", {
        variant: "killer",
        size: 9,
        tier: "medium",
        is_daily: true,
        method: "clipboard",
      });

      expect(plausibleSpy).toHaveBeenCalledWith("puzzle_shared", {
        props: { variant: "killer", size: 9, tier: "medium", is_daily: true, method: "clipboard" },
      });
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/analytics.test.ts`
Expected: FAIL — TypeScript error: `Argument of type '"puzzle_shared"' is not assignable to parameter of type 'EventName'`.

- [ ] **Step 3: Add the event name**

In `web/src/analytics.ts`, change the `EventName` union (lines 1-7) from:

```ts
type EventName =
  | "puzzle_started"
  | "puzzle_completed"
  | "puzzle_abandoned"
  | "daily_streak_milestone"
  | "first_visit_ever"
  | "tier_unmatched";
```

to:

```ts
type EventName =
  | "puzzle_started"
  | "puzzle_completed"
  | "puzzle_abandoned"
  | "daily_streak_milestone"
  | "first_visit_ever"
  | "tier_unmatched"
  | "puzzle_shared";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/analytics.ts web/src/analytics.test.ts
git commit -m "feat(analytics): add puzzle_shared event"
```

---

## Task 5: `App.tsx` — Share button in the win panel

**Files:**
- Modify: `web/src/App.tsx` (import block ~L14; `PlayCard` state ~L670; before `return (` ~L1019; win-panel JSX ~L1104-1115)

- [ ] **Step 1: Add the import**

After line 14 (`import { track } from "./analytics";`), add:

```ts
import { buildShareText, shareResult } from "./share";
```

- [ ] **Step 2: Add `copied` state in `PlayCard`**

In `PlayCard`, immediately after the line `const [outcome, setOutcome] = useState<RecordOutcome | null>(null);` (~L670), add:

```ts
  const [copied, setCopied] = useState(false);
```

- [ ] **Step 3: Add the `handleShare` handler**

Immediately before the `return (` of `PlayCard` (the one at ~L1019, right after the `score` `useMemo` ends with `}, [isSolved, finishedAt, startedAt, mistakes, puzzle.grade]);`), add:

```ts
  const handleShare = async () => {
    const puzzleSize = (puzzle.givens.length === 36 ? 6 : puzzle.givens.length === 256 ? 16 : 9) as Size;
    const parts = buildShareText({
      variant: puzzle.variant,
      size: puzzleSize,
      tier: tierBucket ?? "easy",
      timeSec: elapsedSeconds,
      mistakes,
      streak: getStreak(),
      isDaily: dailyTag !== null,
      date: dailyTag?.date ?? "",
      origin: window.location.origin,
    });
    const method = await shareResult(parts);
    if (method === "cancelled") return;
    if (method === "clipboard") {
      setCopied(true);
      say("Result copied to clipboard.");
      window.setTimeout(() => setCopied(false), 2000);
    } else if (method === "manual") {
      say("Copy your result from the dialog.");
      return;
    }
    track("puzzle_shared", {
      variant: puzzle.variant,
      size: puzzleSize,
      tier: tierBucket ?? "any",
      is_daily: dailyTag !== null,
      method,
    });
  };
```

Note: `getStreak` is already imported at the top of `App.tsx` (line 5); `Size`, `elapsedSeconds`, `mistakes`, `tierBucket`, `dailyTag`, `puzzle`, and `say` are all in `PlayCard` scope.

- [ ] **Step 4: Render the Share button in the win panel**

In the `{isSolved && (...)}` win panel, replace this exact block (the `outcome` best-badge block followed by the panel's two closing lines, ~L1104-1115):

```tsx
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
```

with:

```tsx
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
          <div className="mt-3">
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share your result"
              className="text-xs rounded-full px-3 py-1"
              style={{ border: `1px solid ${playAccent}`, color: playAccent, fontWeight: 600 }}
            >
              {copied ? "Copied ✓" : "Share result"}
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run build`
Expected: PASS — `tsc -b` reports no errors and `vite build` completes.

Run: `npm run lint`
Expected: PASS — no new lint errors in `App.tsx`.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(share): Share button on the win panel"
```

---

## Task 6: `App.tsx` — deep-link entry param on mount

**Files:**
- Modify: `web/src/App.tsx` (import line added in Task 5 ~L15; mount effect ~L244)

- [ ] **Step 1: Add `parseEntryParam` to the import**

Change the import added in Task 5 from:

```ts
import { buildShareText, shareResult } from "./share";
```

to:

```ts
import { buildShareText, parseEntryParam, shareResult } from "./share";
```

- [ ] **Step 2: Act on the entry param in the mount effect**

Replace the mount effect line (~L244):

```ts
  useEffect(() => load("classic", "", 9), []);
```

with:

```ts
  useEffect(() => {
    const entry = parseEntryParam(window.location.search);
    if (entry) {
      // Strip the param so a refresh doesn't re-trigger and the URL stays clean.
      window.history.replaceState(null, "", window.location.pathname);
      if (entry.mode === "daily") {
        loadDaily(entry.variant);
      } else {
        setVariant(entry.variant);
        load(entry.variant, "", 9);
      }
      return;
    }
    load("classic", "", 9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Note: `load`, `loadDaily`, and `setVariant` are all defined in the `App` component above this effect. The `eslint-disable` matches the existing mount-only convention (the original line had stable closures and empty deps); keep it to avoid a new `react-hooks/exhaustive-deps` warning.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run build`
Expected: PASS — no TypeScript errors.

Run: `npm run lint`
Expected: PASS — no new lint errors.

- [ ] **Step 4: Manual verification (dev server)**

Run (from repo root): `make dev` — then in a browser:
- Visit `http://localhost:5173/?d=classic` → loads today's daily Classic, and the URL bar drops the `?d=classic`.
- Visit `http://localhost:5173/?v=jigsaw` → loads a Jigsaw puzzle with the Jigsaw selector active.
- Visit `http://localhost:5173/?v=bogus` → loads the default Classic puzzle (no crash).
- Solve any puzzle, click **Share result** → on desktop the button flips to **Copied ✓**; paste elsewhere to confirm the 3-line text + correct `?d=`/`?v=` link.

Expected: all four behave as described. (Analytics `puzzle_shared` only fires in a production build, per the `track()` PROD guard — not expected to fire in dev.)

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(share): deep-link entry param (?d= daily, ?v= variant)"
```

---

## Task 7: Docs — taxonomy row + event count

**Files:**
- Modify: `docs/superpowers/specs/2026-05-25-plausible-integration-design.md` (after the `tier_unmatched` section ~L123)
- Modify: `CLAUDE.md:70`

- [ ] **Step 1: Add the `puzzle_shared` taxonomy section**

In `docs/superpowers/specs/2026-05-25-plausible-integration-design.md`, replace:

```markdown
Derived from the puzzle response (not the selector) so the props are race-safe. Dev-mode no-ops via the `track()` PROD guard like every other event.

## What Plausible tracks automatically
```

with:

```markdown
Derived from the puzzle response (not the selector) so the props are race-safe. Dev-mode no-ops via the `track()` PROD guard like every other event.

### `puzzle_shared`
Fires when a player successfully shares/copies their result from the win panel (Web Share API or clipboard). Added 2026-06-18 with the share-result hook. Measures how often solves get shared — the top of the viral loop.

| Prop | Type | Values |
|---|---|---|
| `variant` | string | `classic` / `killer` / `jigsaw` / `xsudoku` |
| `size` | number | 6 / 9 / 16 |
| `tier` | string | the graded `tier_label`, or `any` |
| `is_daily` | boolean | true if the shared solve was a daily |
| `method` | string | `native` (Web Share sheet) / `clipboard` |

## What Plausible tracks automatically
```

- [ ] **Step 2: Bump the event count in CLAUDE.md**

In `CLAUDE.md`, replace line 70:

```markdown
- Six custom events: `puzzle_started`, `puzzle_completed`, `puzzle_abandoned`, `daily_streak_milestone`, `first_visit_ever`, `tier_unmatched` (fires when `/api/puzzle` can't hit a requested tier in 60 retries — sizes the need for the #5 pool).
```

with:

```markdown
- Seven custom events: `puzzle_started`, `puzzle_completed`, `puzzle_abandoned`, `daily_streak_milestone`, `first_visit_ever`, `tier_unmatched` (fires when `/api/puzzle` can't hit a requested tier in 60 retries — sizes the need for the #5 pool), `puzzle_shared` (fires on a successful share/copy from the win panel — top of the viral loop).
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-25-plausible-integration-design.md CLAUDE.md
git commit -m "docs(share): document puzzle_shared event"
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — all suites green, including `share.test.ts` and `analytics.test.ts`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS — no errors.

- [ ] **Step 3: Production build (typecheck + bundle)**

Run: `npm run build`
Expected: PASS — `tsc -b` clean, `vite build` emits the bundle.

- [ ] **Step 4: Confirm the spec is fully implemented**

Re-read `docs/superpowers/specs/2026-06-18-share-result-hook-design.md` and confirm each item has a corresponding change: artifact format (Task 1), deep link (Tasks 2 + 6), share mechanism (Task 3), UI placement (Task 5), analytics event (Tasks 4 + 7). Note anything missing.

---

## Self-review notes

- **Spec coverage:** artifact format → Task 1; deep-link parse → Task 2, wiring → Task 6; share mechanism → Task 3; win-panel button + a11y `say()` announcement → Task 5; `puzzle_shared` event → Task 4 (code) + Task 7 (docs). All spec sections map to a task.
- **Type consistency:** `buildShareText` returns `{ body, url, full }` (Task 1) — consumed in Task 5. `shareResult` takes `{ body, url, full }` and returns `ShareMethod` (`"native" | "clipboard" | "manual" | "cancelled"`) — Task 5 branches on exactly those. `parseEntryParam` returns `EntryParam` with `mode: "daily" | "casual"` — Task 6 branches on both. `ShareVariant` matches `App.tsx`'s local `Variant` union.
- **No placeholders:** every code/edit step shows the full content and a unique anchor.
- **Out of scope (per spec):** no image card, no leaderboard, no exact-grid reproduction, no in-progress sharing.
