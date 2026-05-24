import { useEffect, useState } from "react";

type Variant = "classic" | "xsudoku" | "jigsaw" | "killer";

interface Cage {
  cells: number[];
  sum: number;
}

interface PuzzleResponse {
  variant: Variant;
  givens: string;
  solution: string;
  clue_count: number;
  diagonals?: boolean;
  box_of?: number[];
  cages?: Cage[];
  grade?:
    | {
        outcome: "solved";
        tier: number;
        tier_label: string;
        steps: number;
        technique_counts: Record<string, number>;
      }
    | { outcome: "stuck"; steps_taken: number };
  tier_matched?: boolean;
  note?: string;
}

const VARIANT_LABEL: Record<Variant, string> = {
  classic: "Classic",
  xsudoku: "X-Sudoku",
  jigsaw: "Jigsaw",
  killer: "Killer",
};

export function App() {
  const [puzzle, setPuzzle] = useState<PuzzleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [tier, setTier] = useState<string>("");
  const [variant, setVariant] = useState<Variant>("classic");

  const isDemo = import.meta.env.VITE_DEMO === "1";

  const load = (vArg: Variant = variant, tArg: string = tier) => {
    setPuzzle(null);
    setError(null);
    const t0 = performance.now();

    if (isDemo) {
      // Demo mode: pick from a pre-baked pool of static puzzles.
      fetch("puzzles.json")
        .then((r) => r.json())
        .then((pool: Record<Variant, PuzzleResponse[]>) => {
          const choices = pool[vArg];
          if (!choices || choices.length === 0) {
            setError(`no demo puzzles for ${vArg}`);
            return;
          }
          const pick = choices[Math.floor(Math.random() * choices.length)];
          setPuzzle(pick);
          setElapsedMs(Math.round(performance.now() - t0));
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      return;
    }

    const params = new URLSearchParams({ variant: vArg });
    if (tArg && vArg === "classic") params.set("tier", tArg);
    fetch(`/api/puzzle?${params}`)
      .then((r) => r.json())
      .then((data: PuzzleResponse | { error: string }) => {
        if ("error" in data) setError(data.error);
        else {
          setPuzzle(data);
          setElapsedMs(Math.round(performance.now() - t0));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => load("classic", ""), []);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        maxWidth: 760,
        margin: "0 auto",
        color: "#222",
      }}
    >
      <h1 style={{ fontWeight: 500, letterSpacing: -0.5 }}>Stillgrid</h1>
      <p style={{ color: "#555" }}>Sudoku, the quiet way.</p>

      <section style={{ marginTop: 32 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <select
            value={variant}
            onChange={(e) => {
              const v = e.target.value as Variant;
              setVariant(v);
              load(v, tier);
            }}
            style={{ fontFamily: "inherit", fontSize: 13, padding: "4px 6px" }}
          >
            <option value="classic">Classic</option>
            <option value="xsudoku">X-Sudoku</option>
            <option value="jigsaw">Jigsaw</option>
            <option value="killer">Killer</option>
          </select>
          <select
            value={tier}
            onChange={(e) => {
              setTier(e.target.value);
              load(variant, e.target.value);
            }}
            disabled={variant !== "classic"}
            style={{ fontFamily: "inherit", fontSize: 13, padding: "4px 6px" }}
          >
            <option value="">Any difficulty</option>
            <option value="easy">Easy (T1)</option>
            <option value="medium">Medium (T2)</option>
            <option value="hard">Hard (T3)</option>
          </select>
          <button
            onClick={() => load(variant, tier)}
            style={{
              fontFamily: "inherit",
              fontSize: 13,
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            new puzzle
          </button>
        </div>

        {error && <p style={{ color: "#b00", marginTop: 12 }}>error: {error}</p>}
        {!puzzle && !error && <p style={{ color: "#888" }}>generating…</p>}

        {puzzle && (
          <>
            <p style={{ color: "#555", fontSize: 14 }}>
              <strong>{VARIANT_LABEL[puzzle.variant]}</strong>
              {puzzle.clue_count > 0 && ` · ${puzzle.clue_count} clues`}
              {puzzle.cages && ` · ${puzzle.cages.length} cages`}
              {puzzle.grade && puzzle.grade.outcome === "solved" && (
                <>
                  {" · "}
                  <strong style={{ color: "#0a0" }}>
                    {puzzle.grade.tier_label} (T{puzzle.grade.tier}, {puzzle.grade.steps} steps)
                  </strong>
                </>
              )}
              {puzzle.grade && puzzle.grade.outcome === "stuck" && (
                <span style={{ color: "#a60", marginLeft: 6 }}>
                  needs T4+ techniques (Swordfish / XY-Wing)
                </span>
              )}
              {elapsedMs !== null && (
                <span style={{ color: "#888", marginLeft: 8 }}>({elapsedMs} ms)</span>
              )}
            </p>
            <Grid puzzle={puzzle} />
            {puzzle.note && (
              <p style={{ color: "#a60", fontSize: 12, marginTop: 8 }}>{puzzle.note}</p>
            )}
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", color: "#888", fontSize: 13 }}>solution</summary>
              <Grid puzzle={{ ...puzzle, givens: puzzle.solution }} muted />
            </details>
          </>
        )}
      </section>

      <p style={{ color: "#888", fontSize: 13, marginTop: 32 }}>
        {isDemo
          ? "Demo build — pulls from a fixed pool of pre-baked puzzles. The live engine generates fresh ones."
          : "Phase 1 Week 5 — variants live."}
      </p>
    </main>
  );
}

function Grid({ puzzle, muted = false }: { puzzle: PuzzleResponse; muted?: boolean }) {
  const cells = puzzle.givens.split("");
  // Map cell index → cage index, for killer rendering
  const cageOf: (number | null)[] = Array(81).fill(null);
  if (puzzle.cages) {
    puzzle.cages.forEach((cage, ci) => cage.cells.forEach((c) => (cageOf[c] = ci)));
  }
  // For killer, find each cage's top-left cell (lowest index) to display the sum
  const cageSumAt = new Map<number, number>();
  if (puzzle.cages) {
    puzzle.cages.forEach((cage) => {
      const topLeft = cage.cells.reduce((a, b) => Math.min(a, b), 81);
      cageSumAt.set(topLeft, cage.sum);
    });
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(9, 42px)",
        gridTemplateRows: "repeat(9, 42px)",
        width: "max-content",
        marginTop: 12,
        background: "#fff",
        position: "relative",
        outline: "2px solid #222",
      }}
    >
      {cells.map((ch, i) => {
        const row = Math.floor(i / 9);
        const col = i % 9;
        const value = ch === "." || ch === "0" ? "" : ch;
        const sumHere = cageSumAt.get(i);

        // Box borders — use jigsaw box_of if present, otherwise classic 3x3
        const boxOf = puzzle.box_of ?? defaultBoxOf();
        const myBox = boxOf[i];
        const rightIdx = col < 8 ? i + 1 : null;
        const bottomIdx = row < 8 ? i + 9 : null;
        const borderRight =
          col === 8
            ? "none"
            : rightIdx !== null && boxOf[rightIdx] !== myBox
              ? "2px solid #222"
              : "1px solid #ddd";
        const borderBottom =
          row === 8
            ? "none"
            : bottomIdx !== null && boxOf[bottomIdx] !== myBox
              ? "2px solid #222"
              : "1px solid #ddd";

        // Diagonal highlight for X-Sudoku
        let bg: string | undefined;
        if (puzzle.diagonals && (row === col || row + col === 8)) {
          bg = "#fafaf0";
        }

        // Cage outlines for killer (dashed borders where adjacent cell is in a different cage)
        let cageBorderTop, cageBorderLeft, cageBorderRight, cageBorderBottom;
        if (puzzle.cages) {
          const myCage = cageOf[i];
          const above = row > 0 ? cageOf[i - 9] : null;
          const left = col > 0 ? cageOf[i - 1] : null;
          const right = col < 8 ? cageOf[i + 1] : null;
          const below = row < 8 ? cageOf[i + 9] : null;
          if (above !== myCage) cageBorderTop = "1px dashed #888";
          if (left !== myCage) cageBorderLeft = "1px dashed #888";
          if (right !== myCage) cageBorderRight = "1px dashed #888";
          if (below !== myCage) cageBorderBottom = "1px dashed #888";
        }

        return (
          <div
            key={i}
            style={{
              width: 42,
              height: 42,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
              fontSize: 18,
              color: muted ? "#888" : "#222",
              background: bg,
              borderRight,
              borderBottom,
              boxShadow: [
                cageBorderTop && `inset 0 2px 0 -1px ${cageBorderTop.split(" ").slice(-1)[0]}`,
                cageBorderLeft && `inset 2px 0 0 -1px ${cageBorderLeft.split(" ").slice(-1)[0]}`,
                cageBorderRight && `inset -2px 0 0 -1px ${cageBorderRight.split(" ").slice(-1)[0]}`,
                cageBorderBottom && `inset 0 -2px 0 -1px ${cageBorderBottom.split(" ").slice(-1)[0]}`,
              ]
                .filter(Boolean)
                .join(", "),
              position: "relative",
            }}
          >
            {sumHere !== undefined && (
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: 3,
                  fontSize: 10,
                  color: "#666",
                  lineHeight: 1,
                }}
              >
                {sumHere}
              </span>
            )}
            {value}
          </div>
        );
      })}
    </div>
  );
}

function defaultBoxOf(): number[] {
  const out: number[] = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) out.push(Math.floor(r / 3) * 3 + Math.floor(c / 3));
  return out;
}
