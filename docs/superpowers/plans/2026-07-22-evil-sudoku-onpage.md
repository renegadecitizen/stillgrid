# `/evil-sudoku` On-Page Pass + Calculator Light Touch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen `/evil-sudoku` to target the two near-miss queries it's close on (a "Do you have to guess?" section + two new FAQs + a meta refinement, all linking the new `/learn/forcing-chains`), lock the FAQ copy with a new verbatim test, and make one light lede tweak to `/killer-sudoku-calculator`.

**Architecture:** Pure static-HTML + JSON-LD content edits to two existing prerendered pages (no routes/sitemap/engine changes), plus one new Vitest guard file mirroring `web/src/calculator/calc-html.test.ts`.

**Tech Stack:** Static HTML, Schema.org `FAQPage` JSON-LD, `landing.css`, Vitest.

**Key constraint:** For every FAQ, the answer string must be **byte-identical** between the visible `<p>` and the `FAQPage` JSON-LD `text` field (Google requirement + the new test enforces it). The finalized answer strings are given once below; paste the identical string in both places.

## Finalized copy (single source of truth — reuse verbatim)

**New section HTML** (evil-sudoku):
```html
      <h2>Do you have to guess?</h2>
      <p>No — and that is what separates an honestly-built evil puzzle from a cheap one. A genuine evil sudoku always has a path made of pure logic; you just have to climb higher up the ladder to find it. When singles and pairs run dry, you don't start guessing — you look for a pattern: an X-Wing, an XY-Wing, and at the hardest step a <strong>forcing chain</strong>.</p>
      <p>A forcing chain is the move that feels like guessing but isn't. You take a cell with two candidates, follow what each choice forces, and keep only the eliminations both paths agree on — a conclusion that holds whichever candidate is true. It's proof by cases, not trial and error. So if you've ever wondered how to solve an evil sudoku without guessing, that's the answer: <a href="/learn/forcing-chains">forcing chains</a>, walked step by step. Every puzzle we grade Nightmare has been checked to yield to exactly this kind of logic — <a href="/grade">grade one yourself</a> to see the path.</p>
```

**FAQ 4 answer string** (identical in visible `<p>` and JSON-LD `text`):
```
You never have to guess. When the simple techniques stall, an evil sudoku still yields to logic — you escalate to patterns like the X-Wing and XY-Wing, and to forcing chains. A forcing chain tries both candidates of a two-option cell and keeps only the eliminations both branches agree on, so the result is proven either way. Every Nightmare-tier puzzle on Stillgrid is verified to be solvable this way, with no guessing.
```
Question: `How do you solve an evil sudoku without guessing?`

**FAQ 5 answer string** (identical in both):
```
On Stillgrid, evil maps to Nightmare — the top of an honest, technique-based ladder, reached only when a puzzle provably needs chain-based logic. There is one rung beyond it: a grid that defeats every known technique grades as stuck rather than Nightmare. The famous 'world's hardest sudoku' puzzles land there, and we'd rather say so than overstate a grade.
```
Question: `Is evil the hardest level of sudoku?`

**New meta description** (evil-sudoku, replaces the current one):
```
Play evil sudoku online, free — the extreme tier, solvable by logic and never by guessing. Every puzzle is certified to require advanced techniques like X-Wing, XY-Wing, and forcing chains, not just fewer clues.
```

**New calculator lede** (replaces the current lede `<p>`):
```html
      <p class="lede">Every killer sudoku combination, in one place. Enter a cage's sum and cell count to see the combinations that fit, rule digits in or out, catch magic cages, and print the full cheat sheet.</p>
```

---

## Task 1: FAQ-verbatim guard test for `/evil-sudoku`

**Files:**
- Create: `web/src/landing/evil-html.test.ts`

- [ ] **Step 1: Create the test file** with this exact content (verified: `?raw` from `web/public/` resolves under Vitest):

```ts
import { describe, it, expect } from "vitest";
import page from "../../public/evil-sudoku.html?raw";

const LD_BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

function ldBlocks(src: string): { "@type": string; mainEntity?: { acceptedAnswer: { text: string } }[] }[] {
  const out: { "@type": string; mainEntity?: { acceptedAnswer: { text: string } }[] }[] = [];
  let m: RegExpExecArray | null;
  LD_BLOCK.lastIndex = 0;
  while ((m = LD_BLOCK.exec(src))) out.push(JSON.parse(m[1]!));
  return out;
}

describe("evil-sudoku page structured data", () => {
  it("every JSON-LD block parses", () => {
    expect(ldBlocks(page).length).toBeGreaterThan(0);
  });
  it("has exactly one FAQPage", () => {
    expect(ldBlocks(page).filter((b) => b["@type"] === "FAQPage")).toHaveLength(1);
  });
  it("every FAQ answer appears verbatim in the visible copy", () => {
    const visible = page.replace(LD_BLOCK, "");
    const faq = ldBlocks(page).find((b) => b["@type"] === "FAQPage");
    expect(faq?.mainEntity?.length).toBeGreaterThan(0);
    for (const q of faq?.mainEntity ?? []) {
      expect(visible, `"${q.acceptedAnswer.text.slice(0, 40)}…"`).toContain(q.acceptedAnswer.text);
    }
  });
});
```

- [ ] **Step 2: Run it — expect PASS** on the current 3 FAQs (this establishes the guard before edits).

Run: `cd web && npx vitest run src/landing/evil-html.test.ts`
Expected: PASS (3 tests). If the verbatim check fails now, an existing FAQ already drifted — STOP and report.

- [ ] **Step 3: Commit**

```bash
git add web/src/landing/evil-html.test.ts
git commit -m "test(evil-sudoku): guard FAQ answers verbatim against JSON-LD"
```

---

## Task 2: `/evil-sudoku` content — section, two FAQs, meta

**Files:**
- Modify: `web/public/evil-sudoku.html` (meta line 8; FAQPage JSON-LD line 50; new section after line 89; visible FAQ before the `.faq` closing `</div>`)

- [ ] **Step 1: Refine the meta description.** Replace the current `<meta name="description" ...>` (line 8) content with the "New meta description" string above. Exact replacement — match the existing line:

Old:
```html
    <meta name="description" content="Play evil sudoku online, free — the extreme tier where puzzles provably require X-Wing, Swordfish, XY-Wing, or forcing chains. Not just fewer clues: every evil puzzle is certified by the exact techniques it demands. No signup needed." />
```
New:
```html
    <meta name="description" content="Play evil sudoku online, free — the extreme tier, solvable by logic and never by guessing. Every puzzle is certified to require advanced techniques like X-Wing, XY-Wing, and forcing chains, not just fewer clues." />
```

- [ ] **Step 2: Append the two new FAQs to the FAQPage JSON-LD** (line 50). The array currently ends with the "Are Stillgrid's evil sudoku puzzles free?" entry then `}}]}`. Insert the two new question objects before the closing `]}`. Locate this exact tail:

```
...require the techniques its grade claims."}}]}
```
Replace with (note the leading comma joining the new entries, and the two answer strings copied verbatim from the "Finalized copy" section):
```
...require the techniques its grade claims."}},{"@type":"Question","name":"How do you solve an evil sudoku without guessing?","acceptedAnswer":{"@type":"Answer","text":"You never have to guess. When the simple techniques stall, an evil sudoku still yields to logic — you escalate to patterns like the X-Wing and XY-Wing, and to forcing chains. A forcing chain tries both candidates of a two-option cell and keeps only the eliminations both branches agree on, so the result is proven either way. Every Nightmare-tier puzzle on Stillgrid is verified to be solvable this way, with no guessing."}},{"@type":"Question","name":"Is evil the hardest level of sudoku?","acceptedAnswer":{"@type":"Answer","text":"On Stillgrid, evil maps to Nightmare — the top of an honest, technique-based ladder, reached only when a puzzle provably needs chain-based logic. There is one rung beyond it: a grid that defeats every known technique grades as stuck rather than Nightmare. The famous 'world's hardest sudoku' puzzles land there, and we'd rather say so than overstate a grade."}}]}
```

- [ ] **Step 3: Insert the new section** after the "How to solve one" block. Find line 89:
```html
      <p>The full ladder, with examples, lives on the <a href="/learn">learn pages</a>.</p>
```
Insert immediately **after** it (before `<h2>Common questions</h2>`) the "New section HTML" block from the Finalized copy section above.

- [ ] **Step 4: Add the two visible FAQs.** Find the third FAQ's closing and the `.faq` div close:
```html
        <p>Yes. Evil (Nightmare) puzzles are free to play, with no signup needed to start. Each one is generated fresh and verified by the grader to require the techniques its grade claims.</p>
      </div>
```
Insert two `<h3>`/`<p>` pairs **before** `</div>`, using the verbatim answer strings:
```html
        <p>Yes. Evil (Nightmare) puzzles are free to play, with no signup needed to start. Each one is generated fresh and verified by the grader to require the techniques its grade claims.</p>
        <h3>How do you solve an evil sudoku without guessing?</h3>
        <p>You never have to guess. When the simple techniques stall, an evil sudoku still yields to logic — you escalate to patterns like the X-Wing and XY-Wing, and to forcing chains. A forcing chain tries both candidates of a two-option cell and keeps only the eliminations both branches agree on, so the result is proven either way. Every Nightmare-tier puzzle on Stillgrid is verified to be solvable this way, with no guessing.</p>
        <h3>Is evil the hardest level of sudoku?</h3>
        <p>On Stillgrid, evil maps to Nightmare — the top of an honest, technique-based ladder, reached only when a puzzle provably needs chain-based logic. There is one rung beyond it: a grid that defeats every known technique grades as stuck rather than Nightmare. The famous 'world's hardest sudoku' puzzles land there, and we'd rather say so than overstate a grade.</p>
      </div>
```

- [ ] **Step 5: Run the guard test — expect PASS** (proves the JSON-LD ↔ visible byte-match for all 5 FAQs).

Run: `cd web && npx vitest run src/landing/evil-html.test.ts`
Expected: PASS (3 tests). If the verbatim check fails, a new answer string differs between JSON-LD and visible `<p>` — reconcile them to be byte-identical (watch the em-dash `—`, the apostrophes in `don't`/`world's`, and spacing).

- [ ] **Step 6: Commit**

```bash
git add web/public/evil-sudoku.html
git commit -m "feat(growth): /evil-sudoku 'without guessing' section + FAQs, meta refine"
```

---

## Task 3: `/killer-sudoku-calculator` light lede touch

**Files:**
- Modify: `web/killer-sudoku-calculator.html:41`

- [ ] **Step 1: Replace the lede.** Find line 41:
```html
      <p class="lede">Enter a cage's sum and cell count to see every combination that fits. Rule digits in or out, catch magic cages, and print the full cheat sheet.</p>
```
Replace with the "New calculator lede" block from the Finalized copy section:
```html
      <p class="lede">Every killer sudoku combination, in one place. Enter a cage's sum and cell count to see the combinations that fit, rule digits in or out, catch magic cages, and print the full cheat sheet.</p>
```

- [ ] **Step 2: Run the calculator test — expect PASS** (FAQ + tables fixture unaffected by the lede edit).

Run: `cd web && npx vitest run src/calculator/calc-html.test.ts`
Expected: PASS (all tests — JSON-LD parses, FAQ verbatim, both table fixtures match).

- [ ] **Step 3: Commit**

```bash
git add web/killer-sudoku-calculator.html
git commit -m "feat(growth): surface 'killer sudoku combinations' in calculator lede"
```

---

## Task 4: Full web build/test + local prod verification

- [ ] **Step 1: Web build + full test suite.**

Run: `cd web && npm run build && npx vitest run`
Expected: build clean; all tests pass (including the new `evil-html.test.ts` and the untouched `calc-html.test.ts`).

- [ ] **Step 2: Server test** (confirm the evil-sudoku seed-113 guard is still green — content edits didn't touch the sample).

Run: `cd server && npx vitest run src/engine.test.ts -t "evil-sudoku"`
Expected: PASS (baked sample still matches).

- [ ] **Step 3: Local prod smoke.** Serve built dist and confirm both pages + the new content.

```bash
# from repo root, server already built (npm run build in server if not):
PORT=3002 node server/dist/index.js &
sleep 1
curl -sS -o /dev/null -w "evil %{http_code}\n" http://localhost:3002/evil-sudoku
curl -sS http://localhost:3002/evil-sudoku | grep -c "Do you have to guess?"          # expect 1
curl -sS http://localhost:3002/evil-sudoku | grep -o 'href="/learn/forcing-chains"'   # expect the link
curl -sS -o /dev/null -w "calc %{http_code}\n" http://localhost:3002/killer-sudoku-calculator
curl -sS http://localhost:3002/killer-sudoku-calculator | grep -c "Every killer sudoku combination"  # expect 1
kill %1
```
Expected: `evil 200`, `1`, the forcing-chains href, `calc 200`, `1`.

- [ ] **Step 4: Browser check** (optional) — open `http://localhost:3002/evil-sudoku`, confirm the new "Do you have to guess?" section renders in the quiet style, the two new FAQs appear, and the forcing-chains link works; no console errors.

- [ ] **Step 5:** No commit needed if smoke passed (Tasks 1–3 already committed). If a smoke-fix was required, commit it with a clear message.

---

## Notes for the executor

- **Do not push to `main`.** Deploy is a separate explicit step (the `ship` skill), gated on Rob's go-ahead.
- The whole change is copy/JSON-LD; the single highest-risk failure mode is a byte-mismatch between a FAQ's visible `<p>` and its JSON-LD `text`. The em-dash `—`, curly-vs-straight apostrophes, and trailing spaces are the usual culprits — the Task-1 test catches them, so keep it green.
- Leave the unrelated modified `docs/growth/submission-kit.md` untouched and out of every commit (`git add` only the named files).
