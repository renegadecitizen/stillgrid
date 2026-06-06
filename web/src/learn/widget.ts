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
  board.setAttribute("role", "img");

  const caption = document.createElement("p");
  caption.className = "lesson-caption";
  caption.setAttribute("aria-live", "polite");

  const controls = document.createElement("div");
  controls.className = "lesson-controls";
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
    board.setAttribute("aria-label", `${lesson.title}: ${step.caption}`);
    prev.disabled = stepper.atStart;
    next.disabled = stepper.atEnd;
    wireInteractive(step);
  }

  function wireInteractive(step: Step) {
    const inter = lesson.interactive;
    const active = inter && lesson.steps[inter.stepIndex] === step;
    cellEls.forEach((el) => {
      el.classList.toggle("clickable", Boolean(active));
      el.onclick = active
        ? () => {
            const res = checkAnswer(inter!, Number(el.dataset.idx));
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

  // Gentle auto-advance for non-interactive lessons, motion allowed only.
  if (!reduce && !lesson.interactive) {
    const timer = setInterval(() => {
      if (!stepper.next()) {
        clearInterval(timer);
        return;
      }
      paint(stepper.current());
    }, 2600);
    // Stop auto-play as soon as the learner takes manual control.
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
