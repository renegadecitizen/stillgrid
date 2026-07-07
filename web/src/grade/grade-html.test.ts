import { describe, it, expect } from "vitest";
import page from "../../grade.html?raw";
import learnPage from "../../learn.html?raw";
import learnCore from "../../learn-core.html?raw";
import learnAdvanced from "../../learn-advanced.html?raw";
import learnXyWing from "../../learn-xy-wing.html?raw";
import learnSwordfish from "../../learn-swordfish.html?raw";

const LD_BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

function ldBlocks(src: string): { "@type": string; mainEntity?: { acceptedAnswer: { text: string } }[] }[] {
  const out: { "@type": string; mainEntity?: { acceptedAnswer: { text: string } }[] }[] = [];
  let m: RegExpExecArray | null;
  LD_BLOCK.lastIndex = 0;
  while ((m = LD_BLOCK.exec(src))) out.push(JSON.parse(m[1]!));
  return out;
}

describe("grade page structured data", () => {
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

describe("grade page ladder links", () => {
  it("deep-links every learn anchor the result panel uses", () => {
    for (const href of [
      "/learn#naked-single",
      "/learn#hidden-single",
      "/learn/core#naked-pair",
      "/learn/core#hidden-pair",
      "/learn/core#pointing-pair",
      "/learn/advanced#x-wing",
      "/learn/advanced#swordfish",
      "/learn/swordfish",
      "/learn/xy-wing",
    ]) {
      expect(page).toContain(`href="${href}"`);
    }
  });

  it("every anchor target exists on its learn page", () => {
    const targets: Array<[string, string]> = [
      [learnPage, "naked-single"],
      [learnPage, "hidden-single"],
      [learnCore, "naked-pair"],
      [learnCore, "hidden-pair"],
      [learnCore, "pointing-pair"],
      [learnAdvanced, "x-wing"],
      [learnAdvanced, "swordfish"],
    ];
    for (const [src, id] of targets) {
      expect(src, `#${id}`).toContain(`id="${id}"`);
    }
    // The Diabolical families link to whole deep pages, not anchors.
    expect(learnXyWing).toContain('rel="canonical" href="https://stillgrid.app/learn/xy-wing"');
    expect(learnSwordfish).toContain('rel="canonical" href="https://stillgrid.app/learn/swordfish"');
  });
});
