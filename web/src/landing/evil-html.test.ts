import { describe, it, expect } from "vitest";
import page from "../../public/evil-sudoku.html?raw";

const LD_BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

function ldBlocks(src: string): { "@type": string; mainEntity?: { acceptedAnswer: { text: string } }[] }[] {
  const out: { "@type": string; mainEntity?: { acceptedAnswer: { text: string } }[] }[] = [];
  let m: RegExpExecArray | null;
  LD_BLOCK.lastIndex = 0;
  while ((m = LD_BLOCK.exec(src))) out.push(JSON.parse(m[1]!));
  return out;
}

describe("evil-sudoku page structured data", () => {
  it("every JSON-LD block parses", () => {
    expect(ldBlocks(page).length).toBeGreaterThan(0);
  });
  it("has exactly one FAQPage", () => {
    expect(ldBlocks(page).filter((b) => b["@type"] === "FAQPage")).toHaveLength(1);
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
