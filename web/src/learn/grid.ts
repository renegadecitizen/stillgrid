import type { Cell } from "./types";

const DIGITS = "123456789ABCDEFG"; // 16×16 renders 10–16 as A–G

export function digitChar(d: number): string {
  return DIGITS[d - 1] ?? "";
}

export function boxDims(size: number): { h: number; w: number } {
  return size === 6 ? { h: 2, w: 3 } : size === 16 ? { h: 4, w: 4 } : { h: 3, w: 3 };
}

// Build the size×size grid of cell buttons with bold divider classes baked in.
// Cells start out of the tab order (tabIndex -1); callers opt specific cells in.
// When `regions` is given (one region id per cell), bold dividers follow the
// region boundaries (jigsaw) instead of the regular 3×3 boxes.
export function buildCells(size: number, regions?: number[]): HTMLButtonElement[] {
  const box = boxDims(size);
  const cells: HTMLButtonElement[] = [];
  for (let i = 0; i < size * size; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.tabIndex = -1;
    cell.dataset.idx = String(i);
    const r = Math.floor(i / size);
    const c = i % size;
    let boxCls = "";
    if (regions) {
      if (c < size - 1 && regions[i] !== regions[i + 1]) boxCls += " box-r";
      if (r < size - 1 && regions[i] !== regions[i + size]) boxCls += " box-b";
    } else {
      if ((c + 1) % box.w === 0 && c < size - 1) boxCls += " box-r";
      if ((r + 1) % box.h === 0 && r < size - 1) boxCls += " box-b";
    }
    cell.dataset.box = boxCls;
    cell.className = "lesson-cell" + boxCls;
    cells.push(cell);
  }
  return cells;
}

// Reset a cell to its structural baseline (keeps box-divider classes, clears transient).
export function resetCell(el: HTMLButtonElement): void {
  el.className = "lesson-cell" + (el.dataset.box ?? "");
}

// Render a cell's contents (given/value/cands) onto an element. Caller adds highlights.
export function renderCellContent(el: HTMLButtonElement, cell: Cell): void {
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
}
