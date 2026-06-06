import { GUIDED_GAME, createGuided, type GuidedGame } from "./guided";
import { buildCells, resetCell, renderCellContent, digitChar } from "./grid";

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountGuided(host: HTMLElement, game: GuidedGame = GUIDED_GAME): void {
  host.textContent = ""; // replace the static fallback
  host.classList.add("lesson-live");

  const board = document.createElement("div");
  board.className = "lesson-board";
  board.style.setProperty("--n", String(game.size));

  const caption = document.createElement("p");
  caption.className = "lesson-caption";
  caption.setAttribute("aria-live", "polite");

  host.append(board, caption);

  const cells = buildCells(game.size);
  cells.forEach((c) => board.append(c));

  const guided = createGuided(game);
  const reduce = prefersReducedMotion();
  board.classList.toggle("reduce", reduce);

  function render(): void {
    const placed = guided.placed();
    const done = guided.complete;
    const move = done ? null : guided.current();
    const unit = new Set<number>(move ? move.unit : []);
    const block = new Set<number>(move && move.blockers ? move.blockers : []);
    board.setAttribute("role", done ? "img" : "group");
    cells.forEach((el, i) => {
      resetCell(el);
      const digit = placed[i];
      const isGiven = game.givens[i] !== undefined;
      // givens render bold ("given"); learner-placed digits render accent ("placed")
      const cell = isGiven ? { given: digit } : digit !== undefined ? { value: digit } : {};
      renderCellContent(el, cell);
      if (unit.has(i)) el.classList.add("hl-unit");
      if (block.has(i)) el.classList.add("hl-block");
      const target = !done && move !== null && i === move.cell;
      if (target) el.classList.add("hl-target");
      el.classList.toggle("clickable", target);
      el.tabIndex = target ? 0 : -1;
      const r = Math.floor(i / game.size) + 1;
      const c = (i % game.size) + 1;
      if (done) {
        el.removeAttribute("aria-label");
        el.setAttribute("aria-hidden", "true");
      } else {
        el.removeAttribute("aria-hidden");
        el.setAttribute(
          "aria-label",
          digit !== undefined ? `row ${r}, column ${c}, ${digitChar(digit)}` : `row ${r}, column ${c}, empty`,
        );
      }
      el.onclick = target
        ? () => {
            if (guided.attempt(i)) {
              if (guided.complete) {
                renderDone();
              } else {
                render();
                caption.textContent = guided.current().caption;
              }
            } else {
              caption.textContent = "Not that one — look for the cell with only one possible digit. Try again.";
            }
          }
        : null;
    });
    if (move) {
      caption.textContent = move.caption;
      board.setAttribute("aria-label", `Guided game: ${move.caption}`);
    }
  }

  function renderDone(): void {
    render(); // repaint final board (role img, all hidden)
    caption.textContent =
      "Nicely done — that's the core loop. Keep scanning rows, columns, and boxes for cells with just one option.";
    board.setAttribute("aria-label", "Guided game complete.");
    if (!host.querySelector(".guided-cta")) {
      const p = document.createElement("p");
      p.className = "guided-cta";
      const a = document.createElement("a");
      a.className = "cta";
      a.href = "/";
      a.textContent = "Play a full game →";
      p.append(a);
      host.append(p);
      // Move focus off the just-completed cell (now aria-hidden) onto the next action.
      a.focus();
    }
  }

  render();
  caption.textContent = guided.current().caption;
}
