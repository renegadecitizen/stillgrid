// Cage-sum combination math for /killer-sudoku-calculator. Validated against
// the engine's `cage_can_fill` via cage-combos.json (see combos.test.ts).

export interface ComboQuery {
  n: number;
  cells: number;
  sum: number;
  include?: readonly number[];
  exclude?: readonly number[];
}

/** Smallest and largest sum reachable with `cells` distinct digits of 1..n. */
export function sumRange(n: number, cells: number): { min: number; max: number } {
  return { min: (cells * (cells + 1)) / 2, max: (cells * (2 * n + 1 - cells)) / 2 };
}

/**
 * All sets of `cells` distinct digits from 1..n summing to `sum` — ascending
 * within each combination, lexicographic across them (the engine's order).
 */
export function combinations(q: ComboQuery): number[][] {
  const include = q.include ?? [];
  const exclude = q.exclude ?? [];
  const out: number[][] = [];
  const cur: number[] = [];
  const walk = (cells: number, target: number, from: number): void => {
    if (cells === 0) {
      if (target === 0) out.push([...cur]);
      return;
    }
    for (let d = from; d <= q.n; d++) {
      if (target - d < 0) break; // digits only grow from here
      cur.push(d);
      walk(cells - 1, target - d, d + 1);
      cur.pop();
    }
  };
  walk(q.cells, q.sum, 1);
  return out.filter(
    (combo) => include.every((d) => combo.includes(d)) && !exclude.some((d) => combo.includes(d)),
  );
}

/** The SPA's contextual link passes the board size as ?size=6|9|16. */
export function parseSizeParam(search: string): 6 | 9 | 16 | null {
  const raw = new URLSearchParams(search).get("size");
  return raw === "6" ? 6 : raw === "9" ? 9 : raw === "16" ? 16 : null;
}

/** Digits that appear in every combination — forced into the cage. */
export function mustAppear(combos: readonly number[][]): number[] {
  const first = combos[0];
  if (!first) return [];
  return first.filter((d) => combos.every((combo) => combo.includes(d)));
}
