import { describe, expect, it } from "vite-plus/test";

import {
  fenceVisualizeCitations,
  findVisualizeCitations,
  parseVisualizeCitation,
  splitVisualizeCitations,
  VISUALIZE_FENCE_LANGUAGE,
  VISUALIZE_FRAME_HEIGHT,
} from "./visualize.ts";

const cite = (payload: object | string) =>
  `\uE200visualize\uE202${typeof payload === "string" ? payload : JSON.stringify(payload)}\uE201`;

describe("parseVisualizeCitation", () => {
  it("reads Codex's citation, with or without its markers", () => {
    expect(parseVisualizeCitation(cite({ path: "/tmp/v/chart.html" }))).toEqual({
      path: "/tmp/v/chart.html",
    });
    expect(
      parseVisualizeCitation(
        `  ${cite({ path: "C:\\viz\\app.html", mode: "wide", title: " Shell ", attachmentId: "a" })}  `,
      ),
    ).toEqual({ path: "C:\\viz\\app.html", mode: "wide", title: "Shell", attachmentId: "a" });
    expect(parseVisualizeCitation('visualize{"path":"/tmp/v.html"}')).toEqual({
      path: "/tmp/v.html",
    });
    expect(parseVisualizeCitation('\uFFFDvisualize\uFFFD{"path":"/tmp/v.html"}\uFFFD')).toEqual({
      path: "/tmp/v.html",
    });
  });

  it("rejects anything but a whole-line citation of an absolute HTML file", () => {
    for (const line of [
      cite({ path: "chart.html" }),
      cite({ path: "/tmp/chart.png" }),
      cite({ path: "/tmp/chart.html", mode: "tall" }),
      cite('{"path":"/tmp/chart.html"'),
      cite('["/tmp/chart.html"]'),
      `See ${cite({ path: "/tmp/chart.html" })}`,
      'visualize {"path":"/tmp/chart.html"}',
    ]) {
      expect(parseVisualizeCitation(line)).toBeNull();
    }
  });
});

describe("fenceVisualizeCitations", () => {
  it("fences citation lines so Markdown keeps their JSON", () => {
    const line = cite({ path: "/tmp/my_file*.html" });
    expect(fenceVisualizeCitations(`Here it is:\n${line}\nDone.`)).toBe(
      `Here it is:\n\n\`\`\`${VISUALIZE_FENCE_LANGUAGE}\n${line}\n\`\`\`\n\nDone.`,
    );
  });

  it("leaves citations in code and prose alone", () => {
    const line = cite({ path: "/tmp/chart.html" });
    for (const markdown of [
      `\`\`\`text\n${line}\n\`\`\``,
      `~~~~\n${line}\n~~~~`,
      `    ${line}`,
      `Inline ${line} citation.`,
    ]) {
      expect(fenceVisualizeCitations(markdown)).toBe(markdown);
      expect(findVisualizeCitations(markdown)).toEqual([]);
    }
  });
});

describe("splitVisualizeCitations", () => {
  it("takes stored citations out of the text and keeps the rest", () => {
    const stored = cite({ path: "/tmp/a.html", title: "Revenue", attachmentId: "thread-x-html" });
    const unstored = cite({ path: "/tmp/b.html" });
    expect(splitVisualizeCitations(`Intro.\n\n${stored}\n\n${unstored}\n\nOutro.`)).toEqual({
      text: `Intro.\n\n${unstored}\n\nOutro.`,
      renders: [
        { attachmentId: "thread-x-html", title: "Revenue", height: VISUALIZE_FRAME_HEIGHT },
      ],
    });
  });
});
