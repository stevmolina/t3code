import type { HtmlRenderReference } from "./htmlRender.ts";

/**
 * Codex's Visualize skill has the agent write an HTML fragment to a file and
 * cite it on its own line of the reply:
 *
 *   U+E200 "visualize" U+E202 {"path":"/abs/chart.html","mode":"wide","title":"…"} U+E201
 *
 * When the message completes, the Codex adapter copies each cited fragment into
 * a thread attachment and records its id on the citation, so the message keeps
 * showing what it showed then. Clients render only citations that carry one.
 */

export interface VisualizeCitation {
  readonly path: string;
  readonly mode?: "wide";
  readonly title?: string;
  readonly attachmentId?: string;
}

// The markers are private-use characters; some models drop them, and copied
// text can turn them into U+FFFD, so each one is optional.
const CITATION_PATTERN = /^[�]?visualize[�]?(\{.{1,4096}\})[�]?$/su;
const CITATION_HINT = /visualize[�]?\{/u;
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;

/** Fence language that carries a citation from the Markdown parser to its renderer. */
export const VISUALIZE_FENCE_LANGUAGE = "t3-visualize";

/** Frame height for clients that cannot fit the page to its content. */
export const VISUALIZE_FRAME_HEIGHT = 480;

const optionalString = (value: unknown, maxLength: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maxLength
    ? value.trim()
    : undefined;

/** Reads one line. Anything but a well-formed citation of an absolute `.html` path is null. */
export function parseVisualizeCitation(line: string): VisualizeCitation | null {
  const json = CITATION_PATTERN.exec(line.trim())?.[1];
  if (json === undefined) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const { path, mode, title, attachmentId } = payload as Record<string, unknown>;
  if (typeof path !== "string" || path.includes("\0") || !/\.html?$/i.test(path)) return null;
  if (!/^(?:\/|[a-z]:[\\/])/i.test(path) || (mode !== undefined && mode !== "wide")) return null;
  const titleText = optionalString(title, 200);
  const id = optionalString(attachmentId, 256);
  return {
    path,
    ...(mode === "wide" ? { mode } : {}),
    ...(titleText === undefined ? {} : { title: titleText }),
    ...(id === undefined ? {} : { attachmentId: id }),
  };
}

export function formatVisualizeCitation(citation: VisualizeCitation): string {
  return `visualize${JSON.stringify(citation)}`;
}

/**
 * Replaces each citation line with `replace`'s result. Lines in fenced or
 * indented code stay as written.
 */
export function mapVisualizeCitations(
  text: string,
  replace: (citation: VisualizeCitation, line: string) => string,
): string {
  if (!CITATION_HINT.test(text)) return text;
  let openFence: string | null = null;
  return text
    .split("\n")
    .map((line) => {
      const fence = FENCE_PATTERN.exec(line)?.[1];
      if (openFence !== null) {
        if (fence !== undefined && fence[0] === openFence[0] && fence.length >= openFence.length) {
          openFence = null;
        }
        return line;
      }
      if (fence !== undefined) {
        openFence = fence;
        return line;
      }
      const citation = /^(?: {4}|\t)/.test(line) ? null : parseVisualizeCitation(line);
      return citation === null ? line : replace(citation, line);
    })
    .join("\n");
}

export function findVisualizeCitations(text: string): ReadonlyArray<VisualizeCitation> {
  const citations: Array<VisualizeCitation> = [];
  mapVisualizeCitations(text, (citation, line) => (citations.push(citation), line));
  return citations;
}

/** Fences each citation so Markdown keeps its JSON verbatim for the code block renderer. */
export function fenceVisualizeCitations(markdown: string): string {
  return mapVisualizeCitations(markdown, (citation, line) => {
    const indent = /^ */.exec(line)![0];
    return `\n${indent}\`\`\`${VISUALIZE_FENCE_LANGUAGE}\n${indent}${formatVisualizeCitation(citation)}\n${indent}\`\`\`\n`;
  });
}

/** The stored page a citation shows, once the adapter has copied it. */
export function visualizeRenderReference(
  citation: VisualizeCitation,
): HtmlRenderReference | undefined {
  return citation.attachmentId === undefined
    ? undefined
    : {
        attachmentId: citation.attachmentId,
        title: citation.title ?? "Visualization",
        height: VISUALIZE_FRAME_HEIGHT,
      };
}

/** Takes stored citations out of a message's text, for clients that show pages as their own rows. */
export function splitVisualizeCitations(text: string): {
  readonly text: string;
  readonly renders: ReadonlyArray<HtmlRenderReference>;
} {
  const renders: Array<HtmlRenderReference> = [];
  const rest = mapVisualizeCitations(text, (citation, line) => {
    const render = visualizeRenderReference(citation);
    if (render === undefined) return line;
    renders.push(render);
    return "";
  });
  return { text: renders.length === 0 ? text : rest.replace(/\n{3,}/g, "\n\n").trim(), renders };
}

/** Custom build: a stored page's `sendFollowUpMessage`, which drafts its prompt in the composer. */
export const VISUALIZE_FOLLOW_UP_METHOD = "t3/visualize/follow-up";
