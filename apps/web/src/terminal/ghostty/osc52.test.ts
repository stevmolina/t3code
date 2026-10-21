import { describe, expect, it } from "vite-plus/test";

import { TerminalClipboardScanner } from "./osc52";

const encode = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const link = "https://claude.ai/oauth/authorize?code=true&state=abc123";

describe("TerminalClipboardScanner", () => {
  it("decodes BEL- and ST-terminated clipboard writes", () => {
    const scanner = new TerminalClipboardScanner();
    expect(scanner.scan(`before\u001b]52;c;${encode(link)}\u0007after`)).toEqual([link]);
    expect(scanner.scan(`\u001b]52;;${encode("ünïcode ✓")}\u001b\\`)).toEqual(["ünïcode ✓"]);
  });

  it("joins a sequence split across output chunks, including inside the prefix", () => {
    const scanner = new TerminalClipboardScanner();
    const sequence = `\u001b]52;c;${encode(link)}\u0007`;
    expect(scanner.scan(`redraw\u001b]5`)).toEqual([]);
    expect(scanner.scan(sequence.slice(3, 20))).toEqual([]);
    expect(scanner.scan(`${sequence.slice(20)}more output`)).toEqual([link]);
  });

  it("ignores clipboard reads, clears, and aborted or invalid sequences", () => {
    const scanner = new TerminalClipboardScanner();
    expect(scanner.scan("\u001b]52;c;?\u0007")).toEqual([]);
    expect(scanner.scan("\u001b]52;c;\u0007")).toEqual([]);
    expect(scanner.scan("\u001b]52;c;not base64!\u0007")).toEqual([]);
    expect(scanner.scan(`\u001b]52;c;abc\u001b[2K\u001b]52;c;${encode("ok")}\u0007`)).toEqual([
      "ok",
    ]);
  });

  it("forgets a partial sequence on reset so replayed history never copies", () => {
    const scanner = new TerminalClipboardScanner();
    scanner.scan(`\u001b]52;c;${encode(link).slice(0, 10)}`);
    scanner.reset();
    expect(scanner.scan(`${encode(link).slice(10)}\u0007`)).toEqual([]);
  });
});
