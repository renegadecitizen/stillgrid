import type { Lesson, Step } from "./types";
import { createStepper } from "./stepper";
import { checkAnswer } from "./answer";

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const DIGITS = "123456789ABCDEFG"; // 16×16 renders 10–16 as A–G

function digitChar(d: number): string {
  return DIGITS[d - 1] ?? "";
}

export function mountLesson(host: HTMLElement, lesson: Lesson): void {
  host.textContent = ""; // remove the static fallback; JS takes over
  host.classList.add("lesson-live");

  const board = document.createElement("div");
  board.className = "lesson-board";
  board.style.setProperty("--n", String(lesson.size));

  const caption = document.createElement("p");
  caption.className = "lesson-caption";
  caption.setAttribute("aria-live", "polite");

  const controls = document.createElement("div");
  controls.className = "lesson-controls";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "Lesson controls");
  const prev = button("‹ Back");
  const next = button("Next ›");
  const restart = button("Restart");
  controls.append(prev, next, restart);

  host.append(board, caption, controls);

  const stepper = createStepper(lesson);
  const reduce = prefersReducedMotion();

  const cellEls: HTMLButtonElement[] = [];
  for (let i = 0; i < lesson.size * lesson.size; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "lesson-cell";
    cell.tabIndex = -1; // decorative by default; only interactive-step targets join the tab order
    cell.dataset.idx = String(i);
    cellEls.push(cell);
    board.append(cell);
  }

  function paint(step: Step) {
    board.classList.toggle("reduce", reduce);
    const hl = new Map<number, string>();
    for (const h of step.highlights) for (const c of h.cells) hl.set(c, h.kind);
    cellEls.forEach((el, i) => {
      const cell = step.grid[i]!;
      el.className = "lesson-cell";
      const kind = hl.get(i);
      if (kind) el.classList.add(`hl-${kind}`);
      const digit = cell.value ?? cell.given;
      if (digit) {
        el.textContent = digitChar(digit);
        el.classList.toggle("given", cell.given !== undefined);
        el.classList.toggle("placed", cell.value !== undefined);
      } else if (cell.cands && cell.cands.length) {
        el.textContent = cell.cands.map(digitChar).join(" ");
        el.classList.add("cands");
      } else {
        el.textContent = "";
      }
    });
    caption.textContent = step.caption;
    prev.disabled = stepper.atStart;
    next.disabled = stepper.atEnd;
    wireInteractive(step);
  }

  function wireInteractive(step: Step) {
    const inter = lesson.interactive;
    const active = Boolean(inter && lesson.steps[inter.stepIndex] === step);
    // role="img" collapses the decorative board into one announced label; on the
    // interactive step we switch to a group so the clickable cells are exposed to AT.
    board.setAttribute("role", active ? "group" : "img");
    board.setAttribute("aria-label", `${lesson.title}: ${step.caption}`);
    cellEls.forEach((el, i) => {
      const cell = step.grid[i]!;
      const filled = (cell.value ?? cell.given) !== undefined;
      const target = active && !filled; // the learner places into an empty cell
      el.classList.toggle("clickable", target);
      if (active) {
        const r = Math.floor(i / lesson.size) + 1;
        const c = (i % lesson.size) + 1;
        el.setAttribute(
          "aria-label",
          filled ? `row ${r}, column ${c}, ${el.textContent}` : `row ${r}, column ${c}, empty`,
        );
        el.removeAttribute("aria-hidden");
      } else {
        // Non-interactive board is a single role="img" described by its aria-label;
        // its cells are decorative, so hide them from the a11y tree (also satisfies
        // the button-name audit since these <button>s have no accessible name).
        el.removeAttribute("aria-label");
        el.setAttribute("aria-hidden", "true");
      }
      el.tabIndex = target ? 0 : -1;
      el.onclick = target
        ? () => {
            const res = checkAnswer(inter!, i);
            if (res.correct) {
              caption.textContent = `Correct — it must be ${digitChar(res.digit)}.`;
              if (stepper.next()) paint(stepper.current());
            } else {
              caption.textContent = "Not quite — that cell still has other options. Try again.";
            }
          }
        : null;
    });
  }

  prev.onclick = () => {
    if (stepper.prev()) paint(stepper.current());
  };
  next.onclick = () => {
    if (stepper.next()) paint(stepper.current());
  };
  restart.onclick = () => {
    stepper.restart();
    paint(stepper.current());
  };

  paint(stepper.current());

  // Auto-advance non-interactive lessons when motion is allowed. Any manual
  // control click cancels it for good (it does not resume after Restart).
  if (!reduce && !lesson.interactive) {
    const timer = setInterval(() => {
      if (!stepper.next()) {
        clearInterval(timer);
        return;
      }
      paint(stepper.current());
    }, 2600);
    controls.addEventListener("click", () => clearInterval(timer), { once: true });
  }
}

function button(label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "lesson-btn";
  b.textContent = label;
  return b;
}
