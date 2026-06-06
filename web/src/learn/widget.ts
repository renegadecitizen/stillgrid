import type { Lesson, Step } from "./types";
import { createStepper } from "./stepper";
import { buildCells, resetCell, renderCellContent } from "./grid";

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountLesson(host: HTMLElement, lesson: Lesson): void {
  host.textContent = ""; // remove the static fallback; JS takes over
  host.classList.add("lesson-live");

  const board = document.createElement("div");
  board.className = "lesson-board";
  board.style.setProperty("--n", String(lesson.size));
  // The lesson grid is a decorative illustration: one role="img" described by
  // its per-step aria-label, with the cells themselves hidden from the a11y tree.
  board.setAttribute("role", "img");

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

  const cellEls = buildCells(lesson.size);
  cellEls.forEach((cell) => {
    cell.setAttribute("aria-hidden", "true"); // decorative; the board's label conveys state
    board.append(cell);
  });
  board.classList.toggle("reduce", reduce);

  function paint(step: Step) {
    const hl = new Map<number, string>();
    for (const h of step.highlights) for (const c of h.cells) hl.set(c, h.kind);
    cellEls.forEach((el, i) => {
      resetCell(el);
      const kind = hl.get(i);
      if (kind) el.classList.add(`hl-${kind}`);
      renderCellContent(el, step.grid[i]!);
    });
    caption.textContent = step.caption;
    board.setAttribute("aria-label", `${lesson.title}: ${step.caption}`);
    prev.disabled = stepper.atStart;
    next.disabled = stepper.atEnd;
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

  // Auto-advance through the steps when motion is allowed. Any manual control
  // click cancels it for good (it does not resume after Restart).
  if (!reduce) {
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
