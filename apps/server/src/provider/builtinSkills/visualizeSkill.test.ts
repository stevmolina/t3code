import { describe, expect, it } from "vite-plus/test";

import { expandVisualizeSkill, mentionsVisualizeSkill } from "./visualizeSkill.ts";

describe("visualizeSkill", () => {
  it("recognizes the composer's skill mention only as its own word", () => {
    expect(mentionsVisualizeSkill("$visualize how TCP handshakes")).toBe(true);
    expect(mentionsVisualizeSkill("Explain this, $visualize.")).toBe(true);
    expect(mentionsVisualizeSkill("please visualize it")).toBe(false);
    expect(mentionsVisualizeSkill("$visualizer")).toBe(false);
  });

  it("keeps the user's words first and names the output directory", () => {
    const expanded = expandVisualizeSkill("$visualize  how TCP handshakes", "/state/v/thread-1");
    expect(expanded.startsWith("how TCP handshakes\n")).toBe(true);
    expect(expanded).not.toContain("$visualize");
    expect(expanded).toContain('<skill name="visualize">');
    expect(expanded).toContain(
      '\uE200visualize\uE202{"path":"/state/v/thread-1/tcp-handshake.html"}\uE201',
    );
  });

  it("asks for a visual of the conversation when the mention stands alone", () => {
    expect(expandVisualizeSkill("$visualize", "/state/v").split("\n")[0]).toBe(
      "Visualize the current topic of this conversation.",
    );
  });
});
