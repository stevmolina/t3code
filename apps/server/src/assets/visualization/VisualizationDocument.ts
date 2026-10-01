import {
  VISUALIZATION_BRIDGE_SCRIPT,
  VISUALIZATION_HELPERS_SCRIPT,
} from "./visualizationRuntime.ts";
import { VISUALIZATION_STYLES } from "./visualizationStyles.ts";

export const VISUALIZATION_MAX_FRAGMENT_BYTES = 1_000_000;

/** Static resources a fragment may load. Everything else, including fetch and XHR, is blocked. */
const RESOURCE_ORIGINS = [
  "https://cdnjs.cloudflare.com",
  "https://cdn.jsdelivr.net",
  "https://esm.sh",
  "https://unpkg.com",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://fonts.bunny.net",
].join(" ");

/**
 * The page is served as its own document, so this policy replaces the app's
 * instead of inheriting it. `sandbox allow-scripts` gives it an opaque origin:
 * scripts run, but forms, popups, top navigation, and the app's storage and
 * session stay out of reach. The client's iframe repeats the same sandbox.
 */
export const VISUALIZATION_CONTENT_SECURITY_POLICY = [
  "sandbox allow-scripts",
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: ${RESOURCE_ORIGINS}`,
  `style-src 'unsafe-inline' ${RESOURCE_ORIGINS}`,
  `img-src data: blob: ${RESOURCE_ORIGINS}`,
  `font-src data: ${RESOURCE_ORIGINS}`,
  `media-src data: blob: ${RESOURCE_ORIGINS}`,
  "worker-src blob:",
  "connect-src blob: data:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const DOCUMENT_MARKUP = /<!doctype\s|<\s*(?:html|head|body)(?:\s|>)/i;

export type VisualizationFragmentCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "too-large" | "not-a-fragment" | "not-text" };

/** Agents write fragments only; a full document or a binary file is refused. */
export function checkVisualizationFragment(bytes: Uint8Array): VisualizationFragmentCheck {
  if (bytes.byteLength > VISUALIZATION_MAX_FRAGMENT_BYTES)
    return { ok: false, reason: "too-large" };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: "not-text" };
  }
  if (text.includes("\0")) return { ok: false, reason: "not-text" };
  return DOCUMENT_MARKUP.test(text) ? { ok: false, reason: "not-a-fragment" } : { ok: true };
}

const escapeScript = (source: string) => source.replaceAll("</script", "<\\/script");

/** Wraps a checked fragment in the page the client frames inline. */
export function renderVisualizationDocument(fragment: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Visualization</title>
<style>${VISUALIZATION_STYLES}</style>
<script>${escapeScript(VISUALIZATION_BRIDGE_SCRIPT)}</script>
</head>
<body>
${fragment}
<script>${escapeScript(VISUALIZATION_HELPERS_SCRIPT)}</script>
<script id="visualization-lucide" async src="https://unpkg.com/lucide@0.564.0/dist/umd/lucide.min.js"></script>
</body>
</html>
`;
}

/**
 * Served when the fragment disappeared after its URL was issued. It tells the
 * host to fall back to the reference source, since a cross-origin frame's load
 * event cannot report an HTTP error.
 */
export const VISUALIZATION_UNAVAILABLE_DOCUMENT = `<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<script>window.parent.postMessage({ type: "codex-visualization-unavailable" }, "*");</script>
</body></html>
`;
