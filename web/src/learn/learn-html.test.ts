import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// web is ESM ("type": "module") — use import.meta.dirname, not __dirname.
const html = readFileSync(resolve(import.meta.dirname, "../../learn.html"), "utf8");

function jsonLdBlocks(src: string): unknown[] {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const out: unknown[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(JSON.parse(m[1]!));
  return out;
}

describe("learn.html structured data", () => {
  const blocks = jsonLdBlocks(html);

  it("has HowTo, LearningResource, and FAQPage blocks that all parse", () => {
    const types = blocks.map((b) => (b as { "@type": string })["@type"]);
    expect(types).toContain("HowTo");
    expect(types).toContain("LearningResource");
    expect(types).toContain("FAQPage");
  });

  it("FAQ answer text appears verbatim in the visible HTML", () => {
    const faq = blocks.find((b) => (b as { "@type": string })["@type"] === "FAQPage") as {
      mainEntity: { acceptedAnswer: { text: string } }[];
    };
    for (const q of faq.mainEntity) {
      const text = q.acceptedAnswer.text;
      expect(html, `FAQ answer not found verbatim: ${text.slice(0, 40)}…`).toContain(text);
    }
  });
});
