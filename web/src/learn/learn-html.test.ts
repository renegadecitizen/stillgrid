import { describe, it, expect } from "vitest";
import html from "../../learn.html?raw";

const LD_BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

function jsonLdBlocks(src: string): unknown[] {
  const out: unknown[] = [];
  let m: RegExpExecArray | null;
  LD_BLOCK.lastIndex = 0;
  while ((m = LD_BLOCK.exec(src))) out.push(JSON.parse(m[1]!));
  return out;
}

// Visible copy = HTML minus the JSON-LD blocks, so a verbatim match proves the
// FAQ answer is in the rendered <p>, not just echoed in structured data.
const visibleHtml = html.replace(LD_BLOCK, "");

describe("learn.html structured data", () => {
  const blocks = jsonLdBlocks(html);

  it("has HowTo, LearningResource, and FAQPage blocks that all parse", () => {
    const types = blocks.map((b) => (b as { "@type": string })["@type"]);
    expect(types).toContain("HowTo");
    expect(types).toContain("LearningResource");
    expect(types).toContain("FAQPage");
  });

  it("FAQ answer text appears verbatim in the visible HTML", () => {
    const faq = blocks.find((b) => (b as { "@type": string })["@type"] === "FAQPage") as
      | { mainEntity: { acceptedAnswer: { text: string } }[] }
      | undefined;
    expect(faq, "FAQPage block not found").toBeDefined();
    for (const q of faq!.mainEntity) {
      const text = q.acceptedAnswer.text;
      expect(visibleHtml, `FAQ answer not found in visible copy: ${text.slice(0, 40)}…`).toContain(text);
    }
  });
});
