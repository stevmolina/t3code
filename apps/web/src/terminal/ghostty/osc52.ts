const OSC52_PREFIX = "\u001b]52;";
const BEL = "\u0007";
const ESC = "\u001b";
// A sequence still open past this many characters is dropped, so a stray
// prefix cannot make the scanner buffer output forever.
const MAX_PENDING_CHARS = 1 << 20;

/**
 * libghostty-vt drops OSC 52, so the surface scans the stream itself.
 * Sequences may span chunks. Clipboard reads (`?`) are never answered.
 */
export class TerminalClipboardScanner {
  private pending = "";

  scan(chunk: string): string[] {
    const data = this.pending + chunk;
    this.pending = "";
    const texts: string[] = [];
    let from = 0;
    while (from < data.length) {
      const start = data.indexOf(OSC52_PREFIX, from);
      if (start === -1) {
        this.pending = trailingPrefix(data, from);
        break;
      }
      const bodyStart = start + OSC52_PREFIX.length;
      const end = findTerminator(data, bodyStart);
      if (end === null) {
        if (data.length - start <= MAX_PENDING_CHARS) this.pending = data.slice(start);
        break;
      }
      if (end.complete) {
        const text = decodeOsc52Body(data.slice(bodyStart, end.index));
        if (text !== null) texts.push(text);
      }
      from = end.index + end.length;
    }
    return texts;
  }

  reset(): void {
    this.pending = "";
  }
}

/** BEL or ST ends the sequence; any other ESC aborts it. */
function findTerminator(
  data: string,
  from: number,
): { index: number; length: number; complete: boolean } | null {
  for (let index = from; index < data.length; index += 1) {
    const char = data[index];
    if (char === BEL) return { index, length: 1, complete: true };
    if (char !== ESC) continue;
    if (index + 1 >= data.length) return null;
    return data[index + 1] === "\\"
      ? { index, length: 2, complete: true }
      : { index, length: 0, complete: false };
  }
  return null;
}

function trailingPrefix(data: string, from: number): string {
  const maxLength = Math.min(OSC52_PREFIX.length - 1, data.length - from);
  for (let length = maxLength; length > 0; length -= 1) {
    const tail = data.slice(data.length - length);
    if (OSC52_PREFIX.startsWith(tail)) return tail;
  }
  return "";
}

function decodeOsc52Body(body: string): string | null {
  const separator = body.indexOf(";");
  if (separator === -1) return null;
  const payload = body.slice(separator + 1);
  if (payload.length === 0 || payload === "?") return null;
  try {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
