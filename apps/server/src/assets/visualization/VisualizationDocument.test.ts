import { describe, expect, it } from "vite-plus/test";

import {
  checkVisualizationFragment,
  renderVisualizationDocument,
  VISUALIZATION_CONTENT_SECURITY_POLICY,
  VISUALIZATION_MAX_FRAGMENT_BYTES,
} from "./VisualizationDocument.ts";

const encode = (text: string) => new TextEncoder().encode(text);

describe("VisualizationDocument", () => {
  it("accepts fragments and refuses documents, binaries, and oversized files", () => {
    expect(checkVisualizationFragment(encode('<div id="v">Hi</div>'))).toEqual({ ok: true });
    for (const document of ["<!doctype html><p>x</p>", "<html><p>x</p></html>", "<body>x</body>"]) {
      expect(checkVisualizationFragment(encode(document))).toEqual({
        ok: false,
        reason: "not-a-fragment",
      });
    }
    expect(checkVisualizationFragment(new Uint8Array([0xff, 0xfe, 0x00]))).toEqual({
      ok: false,
      reason: "not-text",
    });
    expect(
      checkVisualizationFragment(new Uint8Array(VISUALIZATION_MAX_FRAGMENT_BYTES + 1)),
    ).toEqual({ ok: false, reason: "too-large" });
  });

  it("runs the bridge before the fragment and the helpers after it", () => {
    const page = renderVisualizationDocument('<div id="v"></div><script>draw()</script>');
    const bridge = page.indexOf("codex-visualization-initialize");
    const fragment = page.indexOf('<div id="v">');
    const tabs = page.indexOf('role="tablist"');
    expect(bridge).toBeGreaterThan(0);
    expect(fragment).toBeGreaterThan(bridge);
    expect(tabs).toBeGreaterThan(fragment);
  });

  it("sandboxes the page to scripts only and blocks network calls", () => {
    const directives = new Map(
      VISUALIZATION_CONTENT_SECURITY_POLICY.split("; ").map((directive) => {
        const [name, ...sources] = directive.split(" ");
        return [name, sources] as const;
      }),
    );
    expect(directives.get("sandbox")).toEqual(["allow-scripts"]);
    expect(directives.get("connect-src")).toEqual(["blob:", "data:"]);
    expect(directives.get("form-action")).toEqual(["'none'"]);
    expect(directives.get("frame-src")).toEqual(["'none'"]);
  });
});
