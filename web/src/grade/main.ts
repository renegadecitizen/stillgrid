import "./grade.css";
import { track } from "../analytics";
import { digitToChar, type Size } from "../boardState";
import {
  clueCount,
  parseCellChar,
  parsePasted,
  SIZES,
  TIER_NAMES,
  techniqueBreakdown,
  toPuzzleString,
} from "./ladder";

type GradeVariant = "classic" | "xsudoku";

interface GradeResponse {
  outcome: "solved" | "stuck" | "error";
  tier?: number;
  tier_label?: string;
  steps?: number;
  technique_counts?: Record<string, number>;
  steps_taken?: number;
  error?: string;
}

interface SolveResponse {
  outcome: "unique" | "multiple" | "unsolvable" | "error";
}

const BOX_DIMS: Record<Size, { bh: number; bw: number }> = {
  6: { bh: 2, bw: 3 },
  9: { bh: 3, bw: 3 },
  16: { bh: 4, bw: 4 },
};

const host = document.querySelector<HTMLElement>("[data-grader]");
if (host) mountGrader(host);

function mountGrader(host: HTMLElement): void {
  let n: Size = 9;
  let variant: GradeVariant = "classic";
  let digits: number[] = new Array(81).fill(0);
  let inputs: HTMLInputElement[] = [];

  host.textContent = "";
  host.classList.add("grader");

  const sizeGroup = document.createElement("div");
  sizeGroup.className = "seg";
  sizeGroup.setAttribute("role", "group");
  sizeGroup.setAttribute("aria-label", "Grid size");
  const sizeButtons = SIZES.map((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${s}×${s}`;
    b.setAttribute("aria-pressed", String(s === n));
    b.onclick = () => setSize(s);
    sizeGroup.append(b);
    return b;
  });

  const variantGroup = document.createElement("div");
  variantGroup.className = "seg";
  variantGroup.setAttribute("role", "group");
  variantGroup.setAttribute("aria-label", "Variant");
  const variantDefs: Array<{ v: GradeVariant; label: string }> = [
    { v: "classic", label: "Classic" },
    { v: "xsudoku", label: "X-Sudoku" },
  ];
  const variantButtons = variantDefs.map(({ v, label }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(v === variant));
    b.onclick = () => {
      variant = v;
      variantButtons.forEach((vb, i) => vb.setAttribute("aria-pressed", String(variantDefs[i]!.v === variant)));
    };
    variantGroup.append(b);
    return b;
  });

  const paste = document.createElement("input");
  paste.type = "text";
  paste.id = "grade-paste";
  paste.className = "grade-paste";
  paste.placeholder = "..3.2.6..9..3.5..1..18.64… (. or 0 = empty)";
  paste.autocomplete = "off";
  paste.spellcheck = false;
  paste.oninput = () => {
    const parsed = parsePasted(paste.value);
    if ("error" in parsed) {
      if (paste.value.trim() !== "") status(parsed.error, true);
      return;
    }
    if (parsed.n !== n) setSize(parsed.n, /* keepDigits */ false);
    digits = parsed.digits;
    syncGrid();
    status(`Loaded a ${parsed.n}×${parsed.n} grid with ${clueCount(digits)} givens.`, false);
    paste.value = "";
  };

  const grid = document.createElement("div");
  grid.className = "ggrid";
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-label", "Puzzle entry grid");
  grid.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text") ?? "";
    if (text.replace(/[\s,;|]/g, "").length > 2) {
      e.preventDefault();
      paste.value = text;
      paste.dispatchEvent(new Event("input"));
    }
  });

  const gradeBtn = document.createElement("button");
  gradeBtn.type = "button";
  gradeBtn.className = "grade-go";
  gradeBtn.textContent = "Grade this puzzle";
  gradeBtn.onclick = () => void runGrade();

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "grade-clear";
  clearBtn.textContent = "Clear grid";
  clearBtn.onclick = () => {
    digits = new Array(n * n).fill(0);
    syncGrid();
    result.textContent = "";
    status("", false);
  };

  const statusEl = document.createElement("p");
  statusEl.className = "grade-status";
  statusEl.setAttribute("aria-live", "polite");

  const result = document.createElement("div");
  result.className = "grade-result";
  result.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");
  actions.className = "grade-actions";
  actions.append(gradeBtn, clearBtn);

  host.append(
    row(field("Grid size", sizeGroup), field("Variant", variantGroup)),
    row(field("Paste a puzzle string", paste, "grade-paste")),
    grid,
    actions,
    statusEl,
    result,
  );

  function setSize(s: Size, keepDigits = false): void {
    n = s;
    sizeButtons.forEach((sb, i) => sb.setAttribute("aria-pressed", String(SIZES[i] === n)));
    if (!keepDigits) digits = new Array(n * n).fill(0);
    buildGrid();
  }

  function buildGrid(): void {
    grid.textContent = "";
    grid.className = `ggrid g${n}`;
    grid.style.setProperty("--n", String(n));
    const { bh, bw } = BOX_DIMS[n];
    inputs = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const cell = document.createElement("input");
      cell.type = "text";
      cell.autocomplete = "off";
      cell.spellcheck = false;
      cell.maxLength = n === 16 ? 2 : 1;
      cell.inputMode = n === 16 ? "text" : "numeric";
      cell.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}`);
      if (r > 0 && r % bh === 0) cell.classList.add("bt");
      if (c > 0 && c % bw === 0) cell.classList.add("bl");
      cell.oninput = () => {
        const d = parseCellChar(cell.value.slice(-1), n);
        if (d === null) {
          cell.value = digits[i] ? digitToChar(digits[i]!) : "";
          return;
        }
        digits[i] = d;
        cell.value = d === 0 ? "" : digitToChar(d);
        if (d !== 0 && i + 1 < n * n) inputs[i + 1]?.focus();
      };
      cell.onkeydown = (e) => {
        const move =
          e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? n : e.key === "ArrowUp" ? -n : 0;
        if (move !== 0) {
          e.preventDefault();
          inputs[i + move]?.focus();
        } else if (e.key === "Backspace" && cell.value === "") {
          inputs[i - 1]?.focus();
        }
      };
      grid.append(cell);
      inputs.push(cell);
    }
    syncGrid();
  }

  function syncGrid(): void {
    inputs.forEach((cell, i) => {
      cell.value = digits[i] ? digitToChar(digits[i]!) : "";
    });
  }

  function status(msg: string, isError: boolean): void {
    statusEl.textContent = msg;
    statusEl.classList.toggle("err", isError);
  }

  async function runGrade(): Promise<void> {
    const clues = clueCount(digits);
    if (clues === 0) {
      status("Enter some givens first — type into the grid or paste a puzzle string.", true);
      return;
    }
    const puzzle = toPuzzleString(digits);
    result.textContent = "";
    status("Grading…", false);
    gradeBtn.disabled = true;
    try {
      // Classic grids get a uniqueness pre-check; a puzzle with several
      // solutions (or none) would only ever grade "stuck" and the honest
      // answer is why. The solver CLI is classic-only, so X-Sudoku skips it.
      if (variant === "classic") {
        const solve = await post<SolveResponse>("/api/solve", { puzzle });
        if (solve.outcome === "multiple") {
          status("", false);
          renderVerdict("Not a proper puzzle", `This grid has more than one solution, so it can't be graded — a real sudoku has exactly one. Check for a missing given.`);
          track("grade_used", { variant, size: n, outcome: "multiple" });
          return;
        }
        if (solve.outcome === "unsolvable") {
          status("", false);
          renderVerdict("No solution", `No digit placement completes this grid — two givens probably collide. Check for a typo.`);
          track("grade_used", { variant, size: n, outcome: "unsolvable" });
          return;
        }
      }
      const g = await post<GradeResponse>("/api/grade", { puzzle, variant });
      status("", false);
      renderGrade(g, clues);
      track("grade_used", {
        variant,
        size: n,
        outcome: g.outcome,
        ...(g.tier_label ? { tier: g.tier_label } : {}),
      });
    } catch (e) {
      status(e instanceof Error ? e.message : "Something went wrong — try again.", true);
    } finally {
      gradeBtn.disabled = false;
    }
  }

  function renderVerdict(heading: string, body: string): void {
    result.textContent = "";
    const h = document.createElement("p");
    h.className = "grade-verdict";
    h.textContent = heading;
    const p = document.createElement("p");
    p.textContent = body;
    result.append(h, p);
  }

  function renderGrade(g: GradeResponse, clues: number): void {
    result.textContent = "";
    if (g.outcome === "error") {
      renderVerdict("Couldn't grade", g.error ?? "The grader rejected this input.");
      return;
    }
    if (g.outcome === "stuck") {
      renderVerdict(
        "Beyond the ladder",
        `The grader ran its whole technique ladder — singles through forcing chains — and stalled after ${g.steps_taken ?? 0} steps. Either this puzzle needs patterns beyond Nightmare (rare, but real: the famous "world's hardest" grids live here)${variant === "xsudoku" ? ", or it doesn't have a unique solution" : ""}.`,
      );
      return;
    }

    const tierKey = g.tier_label ?? "";
    const tierName = TIER_NAMES[tierKey] ?? tierKey;
    const head = document.createElement("p");
    head.className = "grade-verdict";
    head.innerHTML = `<span class="tier-badge tier-${tierKey}">${tierName}</span> · ${clues} givens · solved in ${g.steps ?? 0} steps`;

    const list = document.createElement("ul");
    list.className = "tech-list";
    const lines = techniqueBreakdown(g.technique_counts ?? {});
    for (const line of lines) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      if (line.href) {
        const a = document.createElement("a");
        a.href = line.href;
        a.textContent = line.label;
        name.append(a);
      } else {
        name.textContent = line.label;
      }
      const count = document.createElement("span");
      count.className = "n";
      count.textContent = `× ${line.count}`;
      li.append(name, count);
      list.append(li);
    }

    const hardest = lines.filter((l) => l.tier === Math.max(...lines.map((x) => x.tier)));
    const note = document.createElement("p");
    note.innerHTML = `Graded <strong>${tierName}</strong> because the hardest technique it requires is ${hardest
      .map((l) => (l.href ? `<a href="${l.href}">${l.label.toLowerCase()}</a>` : l.label.toLowerCase()))
      .join(" / ")}. <a href="/">Play a ${tierName === "Easy" ? "harder" : "fresh"} one on Stillgrid</a>.`;

    result.append(head, list, note);
  }

  buildGrid();
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

function field(labelText: string, control: HTMLElement, forId?: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "grade-field";
  let label: HTMLElement;
  if (forId) {
    const l = document.createElement("label");
    l.htmlFor = forId;
    label = l;
  } else {
    label = document.createElement("span");
    label.setAttribute("aria-hidden", "true");
  }
  label.className = "grade-label";
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}

function row(...fields: HTMLElement[]): HTMLElement {
  const r = document.createElement("div");
  r.className = "grade-row";
  r.append(...fields);
  return r;
}
