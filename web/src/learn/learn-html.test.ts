import { describe, it, expect } from "vitest";
import learn from "../../learn.html?raw";
import core from "../../learn-core.html?raw";
import advanced from "../../learn-advanced.html?raw";
import variants from "../../learn-variants.html?raw";
import xyWing from "../../learn-xy-wing.html?raw";
import swordfish from "../../learn-swordfish.html?raw";
import coloring from "../../learn-coloring.html?raw";
import forcingChains from "../../learn-forcing-chains.html?raw";

const PAGES: Record<string, string> = { learn, core, advanced, variants, xyWing, swordfish, coloring, forcingChains };
const LD_BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

function blocks(src: string): { "@type": string; mainEntity?: { acceptedAnswer: { text: string } }[] }[] {
  const out: { "@type": string; mainEntity?: { acceptedAnswer: { text: string } }[] }[] = [];
  let m: RegExpExecArray | null;
  LD_BLOCK.lastIndex = 0;
  while ((m = LD_BLOCK.exec(src))) out.push(JSON.parse(m[1]!));
  return out;
}

describe("learn pages structured data", () => {
  for (const [name, html] of Object.entries(PAGES)) {
    it(`${name}: every JSON-LD block parses`, () => {
      expect(blocks(html).length).toBeGreaterThan(0); // JSON.parse throws on malformed
    });
    it(`${name}: every FAQ answer appears verbatim in the visible copy`, () => {
      const visible = html.replace(LD_BLOCK, "");
      const faq = blocks(html).find((b) => b["@type"] === "FAQPage");
      for (const q of faq?.mainEntity ?? []) {
        expect(visible, `${name}: "${q.acceptedAnswer.text.slice(0, 40)}…"`).toContain(q.acceptedAnswer.text);
      }
    });
  }
});
