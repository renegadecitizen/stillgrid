# Plausible → Umami Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hosted Plausible ($9/mo) with Umami Cloud's free Hobby tier across the whole site, keeping the event taxonomy, the `track()` API, and every published privacy promise unchanged.

**Architecture:** Pure client-side swap. The identical 3-line Plausible block in 10 HTML files becomes a 1-line Umami tag (comment + single `<script defer>`); the typed helper `web/src/analytics.ts` calls `window.umami.track(event, props)` instead of `window.plausible(event, {props})`; the privacy page and CLAUDE.md swap provider names. No server, engine, or call-site changes.

**Tech Stack:** Vanilla script tag, TypeScript (strict, `noUncheckedIndexedAccess`), vitest.

**Spec:** `docs/superpowers/specs/2026-07-05-umami-migration-design.md`
**Umami website ID:** `a623ea5c-9c7e-45c2-9d15-6c56bdfe0593` (public by design, safe in committed HTML)

**Correction discovered during planning:** the spec said six HTML files. Reality is **ten** — the four `/learn` pages (`web/learn.html`, `web/learn-core.html`, `web/learn-advanced.html`, `web/learn-variants.html`, Vite MPA entries) shipped after the spec's file list was written and also carry the Plausible block. Task 5 records this correction in the spec.

All commits: conventional-commit style, **no Co-Authored-By trailer** (user preference).

---

### Task 1: Retarget the analytics unit tests to Umami (TDD red)

**Files:**
- Modify: `web/src/analytics.test.ts` (full rewrite, same structure)

- [ ] **Step 1: Replace the entire contents of `web/src/analytics.test.ts` with:**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

type UmamiWindow = { umami?: { track: unknown } };

describe("analytics.track()", () => {
  beforeEach(() => {
    delete (window as UmamiWindow).umami;
    vi.resetModules();
    (import.meta.env as Record<string, unknown>).PROD = false;
  });

  it("no-ops in dev (PROD=false) even if window.umami exists", async () => {
    (import.meta.env as Record<string, unknown>).PROD = false;
    const trackSpy = vi.fn();
    (window as UmamiWindow).umami = { track: trackSpy };
    const { track } = await import("./analytics");

    track("first_visit_ever");

    expect(trackSpy).not.toHaveBeenCalled();
  });

  describe("in production (PROD=true)", () => {
    beforeEach(() => {
      (import.meta.env as Record<string, unknown>).PROD = true;
    });

    it("no-ops when window.umami is undefined", async () => {
      const { track } = await import("./analytics");
      expect(() =>
        track("puzzle_started", { variant: "classic", tier: "easy", is_daily: false }),
      ).not.toThrow();
    });

    it("calls umami.track with event name and flat props", async () => {
      const trackSpy = vi.fn();
      (window as UmamiWindow).umami = { track: trackSpy };
      const { track } = await import("./analytics");

      track("puzzle_completed", {
        variant: "classic",
        tier: "easy",
        is_daily: false,
        duration_seconds: 120,
      });

      expect(trackSpy).toHaveBeenCalledWith("puzzle_completed", {
        variant: "classic",
        tier: "easy",
        is_daily: false,
        duration_seconds: 120,
      });
    });

    it("calls umami.track with undefined data when no props passed", async () => {
      const trackSpy = vi.fn();
      (window as UmamiWindow).umami = { track: trackSpy };
      const { track } = await import("./analytics");

      track("first_visit_ever");

      expect(trackSpy).toHaveBeenCalledWith("first_visit_ever", undefined);
    });

    it("forwards puzzle_shared props", async () => {
      const trackSpy = vi.fn();
      (window as UmamiWindow).umami = { track: trackSpy };
      const { track } = await import("./analytics");

      track("puzzle_shared", {
        variant: "killer",
        size: 9,
        tier: "medium",
        is_daily: true,
        method: "clipboard",
      });

      expect(trackSpy).toHaveBeenCalledWith("puzzle_shared", {
        variant: "killer",
        size: 9,
        tier: "medium",
        is_daily: true,
        method: "clipboard",
      });
    });
  });
});
```

Note the shape change from Plausible: props are passed **flat** as the second argument (`track(name, props)`), not wrapped in `{ props }`.

- [ ] **Step 2: Run the suite to verify it fails**

Run: `cd /Users/robertmccrady/stillgrid/web && npx vitest run src/analytics.test.ts`
Expected: FAIL — the production-mode tests fail because `analytics.ts` still calls `window.plausible`, so the `umami.track` spy is never called (3 failures; the two no-op tests may pass).

### Task 2: Swap the helper implementation (TDD green)

**Files:**
- Modify: `web/src/analytics.ts` (full rewrite, 23 lines)
- Modify: `web/src/storage.ts:221` (comment only)

- [ ] **Step 1: Replace the entire contents of `web/src/analytics.ts` with:**

```ts
type EventName =
  | "puzzle_started"
  | "puzzle_completed"
  | "puzzle_abandoned"
  | "daily_streak_milestone"
  | "first_visit_ever"
  | "tier_unmatched"
  | "puzzle_shared";

type EventProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track: (event: string, data?: EventProps) => void };
  }
}

export function track(event: EventName, props?: EventProps): void {
  if (!import.meta.env.PROD) return;
  const umami = window.umami;
  if (!umami || typeof umami.track !== "function") return;
  umami.track(event, props);
}
```

(The local `const umami` binding is required for TS strict narrowing — `typeof window.umami?.track` alone doesn't narrow `window.umami` on the call line.)

- [ ] **Step 2: Run the suite to verify it passes**

Run: `cd /Users/robertmccrady/stillgrid/web && npx vitest run src/analytics.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 3: Update the stale comment in `web/src/storage.ts` line 221**

Old:
```ts
// --- First-visit tracking (for Plausible first_visit_ever event) -----------
```
New:
```ts
// --- First-visit tracking (for the first_visit_ever analytics event) -------
```

**Do NOT touch `FIRST_VISIT_KEY = "stillgrid:first_visit:v1"`** two lines below — renaming it would re-fire `first_visit_ever` for every returning browser.

- [ ] **Step 4: Commit**

```bash
cd /Users/robertmccrady/stillgrid && git add web/src/analytics.ts web/src/analytics.test.ts web/src/storage.ts && git commit -m "feat(analytics): point track() at window.umami.track"
```

### Task 3: Swap the script tag in all 10 HTML files

**Files:**
- Modify: `web/index.html:16-18`
- Modify: `web/learn.html:26-28`, `web/learn-core.html:26-28`, `web/learn-advanced.html:26-28`, `web/learn-variants.html:26-28`
- Modify: `web/public/classic.html:26-28`, `web/public/killer.html:26-28`, `web/public/jigsaw.html:26-28`, `web/public/xsudoku.html:26-28`
- Modify: `web/public/privacy.html:17-19`

The 3-line block is byte-identical in every file, so do this with one deterministic script rather than 10 hand edits.

- [ ] **Step 1: Run this from the repo root (`/Users/robertmccrady/stillgrid`):**

```bash
python3 - <<'EOF'
import pathlib

OLD = """    <!-- Privacy-friendly analytics by Plausible -->
    <script async src="https://plausible.io/js/pa-HB79xhSO4XQqtCrZGd-vn.js"></script>
    <script>window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()</script>"""

NEW = """    <!-- Privacy-friendly analytics by Umami -->
    <script defer src="https://cloud.umami.is/script.js" data-website-id="a623ea5c-9c7e-45c2-9d15-6c56bdfe0593"></script>"""

files = [
    "web/index.html",
    "web/learn.html",
    "web/learn-core.html",
    "web/learn-advanced.html",
    "web/learn-variants.html",
    "web/public/classic.html",
    "web/public/killer.html",
    "web/public/jigsaw.html",
    "web/public/xsudoku.html",
    "web/public/privacy.html",
]
for f in files:
    p = pathlib.Path(f)
    text = p.read_text()
    assert OLD in text, f"Plausible block not found in {f}"
    p.write_text(text.replace(OLD, NEW, 1))
    print(f"swapped {f}")
EOF
```

Expected output: ten `swapped …` lines, no assertion errors.

- [ ] **Step 2: Verify no script-tag references remain**

Run: `grep -rn "plausible" web/index.html web/learn*.html web/public/*.html`
Expected: exactly 4 hits, all prose in `web/public/privacy.html` (lines ~34-41: the two Analytics paragraphs, "Just Plausible.", and the Cookies line). Those are Task 4's job. Any hit in another file is a failure — stop and investigate.

- [ ] **Step 3: Commit**

```bash
git add web/index.html web/learn.html web/learn-core.html web/learn-advanced.html web/learn-variants.html web/public/classic.html web/public/killer.html web/public/jigsaw.html web/public/xsudoku.html web/public/privacy.html && git commit -m "feat(analytics): swap Plausible script tag for Umami in all 10 pages"
```

### Task 4: Rewrite the privacy page's provider copy

**Files:**
- Modify: `web/public/privacy.html` (4 prose edits; line numbers shifted −1 by Task 3's swap)

The published promises — "no cookies", "no cookie banner", "No Google Analytics" — stay **verbatim**. Only the provider name and links change.

- [ ] **Step 1: Replace the first Analytics paragraph**

Old:
```html
      <p>We use <a href="https://plausible.io/privacy-focused-web-analytics" target="_blank" rel="noopener">Plausible</a> for product analytics. It is GDPR-compliant, doesn't set cookies, doesn't collect personal data, and doesn't track you across sites. It tells us things like "how many people played a killer puzzle today" — never "this specific person did X."</p>
```
New:
```html
      <p>We use <a href="https://umami.is" target="_blank" rel="noopener">Umami</a> for product analytics. It is GDPR-compliant, doesn't set cookies, doesn't collect personal data, and doesn't track you across sites. It tells us things like "how many people played a killer puzzle today" — never "this specific person did X."</p>
```

- [ ] **Step 2: Replace the second Analytics paragraph**

Old:
```html
      <p>Plausible's data lives at plausible.io, not on our servers. Their <a href="https://plausible.io/data-policy" target="_blank" rel="noopener">data policy</a> covers exactly what they collect.</p>
```
New:
```html
      <p>Umami's data lives at cloud.umami.is, not on our servers. Their <a href="https://umami.is/privacy" target="_blank" rel="noopener">privacy policy</a> covers exactly what they collect.</p>
```

(https://umami.is/privacy verified live, HTTP 200, 2026-07-05.)

- [ ] **Step 3: Update the "what we don't use" line**

Old:
```html
      <p>No Google Analytics, no Meta pixel, no advertising network, no session replay, no fingerprinting. Just Plausible.</p>
```
New:
```html
      <p>No Google Analytics, no Meta pixel, no advertising network, no session replay, no fingerprinting. Just Umami.</p>
```

- [ ] **Step 4: Update the Cookies line**

Old:
```html
      <p>Stillgrid does not set cookies. Plausible does not set cookies. There is no cookie banner because there are no cookies to disclose.</p>
```
New:
```html
      <p>Stillgrid does not set cookies. Umami does not set cookies. There is no cookie banner because there are no cookies to disclose.</p>
```

- [ ] **Step 5: Verify the page is Plausible-free**

Run: `grep -rn -i "plausible" web/`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add web/public/privacy.html && git commit -m "docs(privacy): Plausible -> Umami in analytics copy, promises unchanged"
```

### Task 5: Update CLAUDE.md and the spec

**Files:**
- Modify: `CLAUDE.md` (Analytics section, ~lines 64-80)
- Modify: `docs/superpowers/specs/2026-07-05-umami-migration-design.md` (status line + file-count correction)

- [ ] **Step 1: In `CLAUDE.md`, replace these lines of the Analytics section** (leave the event list, the dev-mode bullet, and the "To add a new event" block untouched):

Old:
```markdown
Plausible Analytics (hosted, plausible.io) is the source of truth for product metrics.

- Script tag in all 5 HTML files (`web/index.html` + `web/public/*.html`).
```
New:
```markdown
Umami Analytics (hosted, cloud.umami.is — free Hobby tier: 100k events/mo, 6-month retention) is the source of truth for product metrics.

- Script tag in all 10 HTML files (`web/index.html`, the 4 `web/learn*.html` Vite MPA entries, `web/public/*.html` incl. privacy).
```

Old:
```markdown
- Dashboard: https://plausible.io/stillgrid.app
- Full spec: `docs/superpowers/specs/2026-05-25-plausible-integration-design.md`
```
New:
```markdown
- Dashboard: https://cloud.umami.is (website ID a623ea5c-9c7e-45c2-9d15-6c56bdfe0593)
- Event taxonomy spec: `docs/superpowers/specs/2026-05-25-plausible-integration-design.md` (names/props still authoritative); provider migration: `docs/superpowers/specs/2026-07-05-umami-migration-design.md`
```

Also in that section: if the `track` helper bullet mentions Plausible, reword to "calls `window.umami.track`".

- [ ] **Step 2: In the spec, update the status line**

Old:
```markdown
**Status:** Design approved 2026-07-05, awaiting Umami website ID + implementation plan
```
New:
```markdown
**Status:** Implemented 2026-07-05 (plan: ../plans/2026-07-05-umami-migration.md). Correction: 10 HTML files, not 6 — the four `web/learn*.html` pages also carried the snippet.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-07-05-umami-migration-design.md && git commit -m "docs: record Umami migration in CLAUDE.md and spec"
```

### Task 6: CI gates (run locally, do NOT push)

Per the project's CI-gate rule, run all three surfaces even though only `web/` changed:

- [ ] **Step 1:** `cd /Users/robertmccrady/stillgrid/web && npm test && npm run build && npm run lint` — Expected: vitest all green, `tsc -b && vite build` clean, eslint clean.
- [ ] **Step 2:** `cd /Users/robertmccrady/stillgrid/server && npm run build && npm test && npm run lint` — Expected: clean (server untouched; this catches accidental cross-package breakage).
- [ ] **Step 3:** `cd /Users/robertmccrady/stillgrid/engine && cargo fmt --check && cargo clippy --release -- -D warnings && cargo test --release` — Expected: clean (engine untouched; mirrors the CI matrix).
- [ ] **Step 4: STOP.** Do not push. Pushing to `main` auto-deploys to production via Render — the user must explicitly approve (their standing rule). Hand back with a summary and offer `/ship`.

### Task 7: Post-deploy verification and decommission (after the user approves the push)

- [ ] **Step 1:** After deploy, on https://stillgrid.app check (curl or browser devtools): `curl -s https://stillgrid.app | grep -c umami` → ≥1, and `curl -s https://stillgrid.app | grep -c plausible` → 0. Spot-check `/privacy`, `/classic`, `/learn` the same way.
- [ ] **Step 2:** Load the site in a real browser, start + solve a puzzle; confirm pageviews and `puzzle_started` / `puzzle_completed` (with variant/tier props) appear in the Umami dashboard (data may take ~1 min).
- [ ] **Step 3 (user):** Export the Plausible CSV (plausible.io dashboard → export), keep it locally outside the repo, then cancel the Plausible subscription.
- [ ] **Step 4:** Update the assistant memory file about the plausible-mcp server (it retires when the subscription lapses) and note the Umami dashboard as the new metrics home.
