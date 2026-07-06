import { describe, it, expect } from "vitest";
import page from "../../killer-sudoku-calculator.html?raw";
import raw from "./cage-combos.json?raw";

interface FullEntry {
  n: number;
  cells: number;
  sum: number;
  combos: number[][];
}
const FIXTURE = JSON.parse(raw) as { full: FullEntry[] };

const LD_BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

function ldBlocks(src: string): { "@type": string; mainEntity?: { acceptedAnswer: { text: string } }[] }[] {
  const out: { "@type": string; mainEntity?: { acceptedAnswer: { text: string } }[] }[] = [];
  let m: RegExpExecArray | null;
  LD_BLOCK.lastIndex = 0;
  while ((m = LD_BLOCK.exec(src))) out.push(JSON.parse(m[1]!));
  return out;
}

describe("calculator page structured data", () => {
  it("every JSON-LD block parses", () => {
    expect(ldBlocks(page).length).toBe(2); // WebApplication + FAQPage
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

// The static tables are generated from cage-combos.json (the engine fixture);
// this pins them so a fixture regeneration can't leave the page stale.
function tableEntries(sectionId: string): { cells: number; sum: number; combos: number[][]; magic: boolean }[] {
  const section = new RegExp(`<section id="${sectionId}"[^>]*>([\\s\\S]*?)</section>`).exec(page)?.[1];
  expect(section, `section #${sectionId}`).toBeTruthy();
  const out: { cells: number; sum: number; combos: number[][]; magic: boolean }[] = [];
  const blocks = /<h3 id="cages-\d+-(\d+)"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g;
  let b: RegExpExecArray | null;
  while ((b = blocks.exec(section!))) {
    const cells = Number(b[1]);
    const rows = /<tr><th scope="row">(\d+)<\/th><td>([\s\S]*?)<\/td><\/tr>/g;
    let r: RegExpExecArray | null;
    while ((r = rows.exec(b[2]!))) {
      const combos: number[][] = [];
      let magic = false;
      const spans = /<span class="combo( magic)?">([\d+]+)<\/span>/g;
      let s: RegExpExecArray | null;
      while ((s = spans.exec(r[2]!))) {
        if (s[1]) magic = true;
        combos.push(s[2]!.split("+").map(Number));
      }
      out.push({ cells, sum: Number(r[1]), combos, magic });
    }
  }
  return out;
}

describe.each([
  { sectionId: "tables-9", n: 9, total: 502 },
  { sectionId: "tables-6", n: 6, total: 57 },
])("static tables match the engine fixture ($sectionId)", ({ sectionId, n, total }) => {
  const expected = FIXTURE.full
    .filter((e) => e.n === n)
    .map((e) => ({ cells: e.cells, sum: e.sum, combos: e.combos, magic: e.combos.length === 1 }));
  const actual = tableEntries(sectionId);

  it("lists every (cells, sum) row with exactly the engine's combinations", () => {
    expect(actual).toEqual(expected);
  });

  it(`carries all ${total} combinations`, () => {
    expect(actual.reduce((acc, e) => acc + e.combos.length, 0)).toBe(total);
  });
});
