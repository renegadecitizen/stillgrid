import "./calc.css";
import { combinations, mustAppear, parseSizeParam, sumRange } from "./combos";
import { track } from "../analytics";

const SIZES = [6, 9, 16] as const;
type Size = (typeof SIZES)[number];

const host = document.querySelector<HTMLElement>("[data-calculator]");
if (host) mountCalculator(host);

const printBtn = document.querySelector<HTMLButtonElement>("[data-print]");
if (printBtn) {
  printBtn.hidden = false;
  printBtn.addEventListener("click", () => window.print());
}

function mountCalculator(host: HTMLElement): void {
  let n: Size = parseSizeParam(window.location.search) ?? 9;
  let cells = 3;
  const include = new Set<number>();
  const exclude = new Set<number>();
  let tracked = false;

  host.textContent = ""; // remove the static fallback; JS takes over
  host.classList.add("calc");

  const sizeGroup = document.createElement("div");
  sizeGroup.className = "seg";
  sizeGroup.setAttribute("role", "group");
  sizeGroup.setAttribute("aria-label", "Grid size");
  const sizeButtons = SIZES.map((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${s}×${s}`;
    b.setAttribute("aria-pressed", String(s === n));
    b.onclick = () => {
      if (n === s) return;
      n = s;
      sizeButtons.forEach((sb, i) => sb.setAttribute("aria-pressed", String(SIZES[i] === n)));
      cells = Math.min(cells, n);
      for (const d of include) if (d > n) include.delete(d);
      for (const d of exclude) if (d > n) exclude.delete(d);
      rebuildForSize();
      update(true);
    };
    sizeGroup.append(b);
    return b;
  });

  const cellsSelect = document.createElement("select");
  cellsSelect.id = "calc-cells";
  cellsSelect.onchange = () => {
    cells = Number(cellsSelect.value);
    update(true);
  };

  const sumInput = document.createElement("input");
  sumInput.type = "number";
  sumInput.id = "calc-sum";
  sumInput.inputMode = "numeric";
  sumInput.value = "15";
  sumInput.oninput = () => update(true);

  const sumHint = document.createElement("span");
  sumHint.className = "calc-hint";

  const includeRow = digitRow("include", "Digits that must appear", (d, btn) => {
    toggle(include, d, btn);
    if (include.has(d)) untoggle(exclude, d, excludeRow);
    update(true);
  });
  const excludeRow = digitRow("exclude", "Digits to rule out", (d, btn) => {
    toggle(exclude, d, btn);
    if (exclude.has(d)) untoggle(include, d, includeRow);
    update(true);
  });

  const status = document.createElement("p");
  status.className = "calc-status";
  status.setAttribute("aria-live", "polite");

  const results = document.createElement("ul");
  results.className = "calc-results";

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "calc-reset";
  reset.textContent = "Clear filters";
  reset.onclick = () => {
    untoggleAll(include, includeRow);
    untoggleAll(exclude, excludeRow);
    update(true);
  };

  host.append(
    row(field("Grid size", sizeGroup)),
    row(
      field("Cells in the cage", cellsSelect, "calc-cells"),
      field("Cage sum", sumWrap(sumInput, sumHint), "calc-sum"),
    ),
    row(field("Digits that must appear", includeRow)),
    row(field("Digits to rule out", excludeRow)),
    reset,
    status,
    results,
  );

  function rebuildForSize(): void {
    cellsSelect.textContent = "";
    for (let k = 2; k <= n; k++) {
      const opt = document.createElement("option");
      opt.value = String(k);
      opt.textContent = String(k);
      opt.selected = k === cells;
      cellsSelect.append(opt);
    }
    rebuildDigits(includeRow, include);
    rebuildDigits(excludeRow, exclude);
  }

  function rebuildDigits(rowEl: HTMLElement, set: Set<number>): void {
    rowEl.querySelectorAll("button").forEach((b, i) => {
      b.hidden = i + 1 > n;
      b.setAttribute("aria-pressed", String(set.has(i + 1)));
    });
  }

  function update(fromUser: boolean): void {
    const { min, max } = sumRange(n, cells);
    sumInput.min = String(min);
    sumInput.max = String(max);
    sumHint.textContent = `${min}–${max} for ${cells} cells`;

    results.textContent = "";
    const sum = Number(sumInput.value);
    if (sumInput.value.trim() === "" || !Number.isInteger(sum)) {
      status.textContent = "Enter a cage sum.";
      return;
    }

    const combos = combinations({ n, cells, sum, include: [...include], exclude: [...exclude] });
    const forced = mustAppear(combos);

    for (const combo of combos) {
      const li = document.createElement("li");
      if (combos.length === 1) li.classList.add("magic");
      combo.forEach((d, i) => {
        if (i > 0) li.append("+");
        if (forced.includes(d)) {
          const strong = document.createElement("strong");
          strong.className = "forced";
          strong.textContent = String(d);
          li.append(strong);
        } else {
          li.append(String(d));
        }
      });
      results.append(li);
    }

    if (combos.length === 0) {
      status.textContent =
        sum < min || sum > max
          ? `No combination — sums for ${cells} cells run ${min} to ${max}.`
          : "No combination fits — loosen the filters.";
    } else if (combos.length === 1) {
      status.textContent = "1 combination — a magic cage: every digit is forced.";
    } else {
      const shared =
        forced.length > 0 ? ` ${listDigits(forced)} in every one.` : "";
      status.textContent = `${combos.length} combinations.${shared}`;
    }

    if (fromUser && !tracked) {
      tracked = true;
      track("calculator_used", { size: n, cells, sum });
    }
  }

  function digitRow(kind: string, label: string, onToggle: (d: number, btn: HTMLButtonElement) => void): HTMLElement {
    const rowEl = document.createElement("div");
    rowEl.className = "digit-row";
    rowEl.setAttribute("role", "group");
    rowEl.setAttribute("aria-label", label);
    for (let d = 1; d <= 16; d++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `digit-btn ${kind}`;
      b.textContent = String(d);
      b.setAttribute("aria-pressed", "false");
      b.onclick = () => onToggle(d, b);
      rowEl.append(b);
    }
    return rowEl;
  }

  rebuildForSize();
  update(false);
}

function toggle(set: Set<number>, d: number, btn: HTMLButtonElement): void {
  if (set.has(d)) set.delete(d);
  else set.add(d);
  btn.setAttribute("aria-pressed", String(set.has(d)));
}

function untoggle(set: Set<number>, d: number, rowEl: HTMLElement): void {
  if (!set.delete(d)) return;
  const btn = rowEl.querySelectorAll("button")[d - 1];
  btn?.setAttribute("aria-pressed", "false");
}

function untoggleAll(set: Set<number>, rowEl: HTMLElement): void {
  set.clear();
  rowEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
}

function listDigits(digits: readonly number[]): string {
  if (digits.length === 1) return `${digits[0]} appears`;
  const last = digits[digits.length - 1];
  return `${digits.slice(0, -1).join(", ")} and ${last} appear`;
}

function field(labelText: string, control: HTMLElement, forId?: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "calc-field";
  let label: HTMLElement;
  if (forId) {
    const l = document.createElement("label");
    l.htmlFor = forId;
    label = l;
  } else {
    // Grouped controls (segmented buttons, digit rows) carry their own
    // aria-label; their visible heading is decorative.
    label = document.createElement("span");
    label.setAttribute("aria-hidden", "true");
  }
  label.className = "calc-label";
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}

function sumWrap(input: HTMLInputElement, hint: HTMLElement): HTMLElement {
  const wrap = document.createElement("div");
  wrap.append(input, hint);
  return wrap;
}

function row(...fields: HTMLElement[]): HTMLElement {
  const r = document.createElement("div");
  r.className = "calc-row";
  r.append(...fields);
  return r;
}
