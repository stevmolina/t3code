import { describe, expect, it } from "vite-plus/test";

import {
  fenceVisualizeCitations,
  parseVisualizeCitation,
  VISUALIZE_CITATION_FENCE_LANGUAGE,
} from "./visualize.ts";

const reference = (payload: string) => `\uE200visualize\uE202${payload}\uE201`;

describe("parseVisualizeCitation", () => {
  it("reads the path, wide mode, and title", () => {
    expect(parseVisualizeCitation(reference('{"path":"/tmp/v/chart.html"}'))).toEqual({
      path: "/tmp/v/chart.html",
      mode: "normal",
    });
    expect(
      parseVisualizeCitation(
        `  ${reference('{"path":"C:\\\\viz\\\\app.html","mode":"wide","title":" Shell "}')}  `,
      ),
    ).toEqual({ path: "C:\\viz\\app.html", mode: "wide", title: "Shell" });
  });

  it("rejects anything but a well-formed absolute HTML reference", () => {
    for (const line of [
      reference('{"path":"chart.html"}'),
      reference('{"path":"/tmp/chart.png"}'),
      reference('{"path":"/tmp/chart.html","mode":"tall"}'),
      reference('{"path":"/tmp/chart.html"'),
      reference('["/tmp/chart.html"]'),
      `\uE200other\uE202{"path":"/tmp/chart.html"}\uE201`,
      `See ${reference('{"path":"/tmp/chart.html"}')}`,
    ]) {
      expect(parseVisualizeCitation(line)).toBeNull();
    }
  });
});

describe("fenceVisualizeCitations", () => {
  it("fences reference lines so their JSON survives Markdown", () => {
    const line = reference('{"path":"/tmp/my_file*.html"}');
    expect(fenceVisualizeCitations(`Here it is:\n${line}\nDone.`)).toBe(
      `Here it is:\n\n\`\`\`${VISUALIZE_CITATION_FENCE_LANGUAGE}\n${line}\n\`\`\`\n\nDone.`,
    );
  });

  it("leaves references inside code and inline prose alone", () => {
    const line = reference('{"path":"/tmp/chart.html"}');
    for (const markdown of [
      `\`\`\`text\n${line}\n\`\`\``,
      `~~~~\n${line}\n~~~~`,
      `    ${line}`,
      `Inline ${line} reference.`,
      "No reference here.",
    ]) {
      expect(fenceVisualizeCitations(markdown)).toBe(markdown);
    }
  });
});
