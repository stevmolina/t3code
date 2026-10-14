import type { ThreadId } from "@t3tools/contracts";
import { injectHtmlRenderBootstrap } from "@t3tools/shared/htmlRender";
import { mcpAppContentSecurityPolicy } from "@t3tools/shared/mcpApp";
import {
  findVisualizeCitations,
  formatVisualizeCitation,
  mapVisualizeCitations,
  VISUALIZE_FOLLOW_UP_METHOD,
} from "@t3tools/shared/visualize";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Stream from "effect/Stream";

import { resolveAttachmentRelativePath } from "../attachmentPaths.ts";
import { createDeterministicAttachmentId } from "../attachmentStore.ts";

const MAX_FRAGMENT_BYTES = 1_000_000;
const MAX_CITATIONS = 8;
const DOCUMENT_MARKUP = /<!doctype\s|<\s*(?:html|head|body)(?:\s|>)/i;

// Codex's runtime lets a fragment load static files from these and nothing
// else: no fetch, XHR, or WebSocket. The page keeps that policy here.
const VISUALIZE_POLICY = mcpAppContentSecurityPolicy({
  resourceDomains: [
    "https://cdnjs.cloudflare.com",
    "https://cdn.jsdelivr.net",
    "https://esm.sh",
    "https://unpkg.com",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "https://fonts.bunny.net",
  ],
});

// The names Codex's skill tells fragments to use that the HTML render theme
// lacks, mapped onto it. Only the vocabulary fragments commonly rely on.
const CODEX_VOCABULARY = `:root{--font-size-base:16px;--blue:light-dark(#339cff,#339cff);--orange:light-dark(#e25507,#fb6a22);--green:light-dark(#00a240,#40c977);--red:light-dark(#e02e2a,#ff6764);--purple:light-dark(#924ff7,#ad7bf9);--yellow:light-dark(#ffc300,#ffd240);--viz-series-1:var(--chart-1);--viz-series-2:var(--chart-2);--viz-series-3:var(--chart-3);--viz-series-4:var(--chart-4);--viz-series-5:var(--chart-5);--viz-series-6:var(--chart-6)}
hr{height:1px;margin-block:6px;border:0;background:var(--border)}
.card{min-width:0;padding:12px;overflow:hidden;overflow-wrap:break-word;border-radius:var(--radius);color:var(--card-foreground);background:var(--card)}
.viz-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(max(180px,24%),1fr));gap:10px}
.viz-row,.viz-controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.viz-stat{display:flex;flex-direction:column;gap:2px}
.viz-stat-value{font-size:1.5em;font-weight:500;line-height:1.25}
.viz-badge{display:inline-flex;align-items:center;padding:4px 8px;border-radius:6px;color:var(--muted-foreground);background:color-mix(in srgb,var(--foreground) 5%,transparent);font-size:12px;line-height:1}
small,.text-small{font-size:12px}.text-muted{color:var(--muted-foreground)}.tabular-nums{font-variant-numeric:tabular-nums}
.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:36px;padding:0 12px;border:1px solid var(--border);border-radius:999px;color:var(--secondary-foreground);background:var(--secondary);font:inherit;line-height:18px;white-space:nowrap;cursor:pointer}
.btn:not(:disabled):hover{background:color-mix(in srgb,var(--foreground) 8%,transparent)}.btn:disabled{opacity:.5;cursor:default}
.btn-primary,.btn:is([aria-pressed="true"],[aria-selected="true"],.is-selected){color:var(--primary-foreground);background:var(--primary)}
.btn-ghost{border-color:transparent;color:var(--muted-foreground);background:transparent}.btn-block,.viz-tile{width:100%}
.form-label{display:flex;flex-direction:column;gap:4px;color:var(--muted-foreground);font-size:12px}
.form-control,.form-select{padding:6px 10px;border:1px solid var(--input);border-radius:8px;color:var(--foreground);background:transparent;font:inherit}
.form-range,.form-check-input{accent-color:var(--chart-1)}
.table{width:100%;border-collapse:collapse}.table :is(th,td){padding:6px 8px;border-bottom:1px solid var(--border);text-align:start}
.progress{display:flex;height:8px;overflow:hidden;border-radius:999px;background:var(--muted)}.progress-bar{background:var(--viz-series-1)}`;

// Custom build: Codex's follow-up buttons post their prompt to the client, which
// drafts it in the composer. Widget state is accepted and not kept.
const FOLLOW_UP_BRIDGE = `<script>window.openai=Object.assign(window.openai||{},{sendFollowUpMessage:function(m){parent.postMessage({jsonrpc:"2.0",method:"${VISUALIZE_FOLLOW_UP_METHOD}",params:{prompt:String((m&&m.prompt)||"")}},"*");return Promise.resolve()},setWidgetState:function(){return Promise.resolve()}})</script>`;

/** The stored page for a fragment: the HTML render theme, Codex's vocabulary, and its policy. */
function visualizePage(fragment: string): string {
  return injectHtmlRenderBootstrap(
    `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${VISUALIZE_POLICY}"><style>${CODEX_VOCABULARY}</style>${FOLLOW_UP_BRIDGE}</head><body>${fragment}</body></html>`,
  );
}

/** Copies one fragment into the thread's attachments. Undefined when the file is not a fragment. */
const snapshotFragment = (attachmentsDir: string, threadId: ThreadId, path: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const info = yield* fileSystem.stat(path);
    if (info.type !== "File" || Number(info.size) > MAX_FRAGMENT_BYTES) return undefined;
    // The file can grow after `stat`, so the read stops one byte past the limit.
    const bytes = yield* fileSystem
      .stream(path, { bytesToRead: MAX_FRAGMENT_BYTES + 1 })
      .pipe(Stream.mkUint8Array);
    const fragment = new TextDecoder().decode(bytes);
    if (bytes.byteLength > MAX_FRAGMENT_BYTES || fragment.includes("\0")) return undefined;
    if (DOCUMENT_MARKUP.test(fragment)) return undefined;
    const page = visualizePage(fragment);
    // Named for its content, so completing the same reply twice stores one page
    // and yields the same text, and a rewritten file never changes an old reply.
    const stableId = createDeterministicAttachmentId(threadId, `visualize:${page}`);
    const attachmentId = stableId === null ? null : `${stableId}-html`;
    const filePath =
      attachmentId === null
        ? null
        : resolveAttachmentRelativePath({ attachmentsDir, relativePath: `${attachmentId}.html` });
    if (attachmentId === null || filePath === null) return undefined;
    yield* fileSystem
      .writeFileString(filePath, page)
      .pipe(Effect.onError(() => fileSystem.remove(filePath, { force: true }).pipe(Effect.ignore)));
    return attachmentId;
  });

/**
 * Stores the fragment behind each Visualize citation in `text` and records its
 * attachment id on the citation. A citation whose file cannot be stored keeps
 * no id, so clients show it as written.
 */
export const snapshotVisualizeCitations = Effect.fn("VisualizeSnapshot.snapshot")(
  function* (input: {
    readonly attachmentsDir: string;
    readonly threadId: ThreadId;
    readonly text: string;
  }) {
    const paths = [...new Set(findVisualizeCitations(input.text).map(({ path }) => path))];
    if (paths.length === 0) return input.text;
    const stored = new Map<string, string>();
    for (const path of paths.slice(0, MAX_CITATIONS)) {
      const attachmentId = yield* snapshotFragment(input.attachmentsDir, input.threadId, path).pipe(
        Effect.catch((cause) =>
          Effect.logWarning("Could not store a Visualize fragment; showing its citation.", {
            cause,
          }).pipe(Effect.as(undefined)),
        ),
      );
      if (attachmentId !== undefined) stored.set(path, attachmentId);
    }
    // An id the agent wrote itself never survives: only stored pages render.
    return mapVisualizeCitations(input.text, ({ attachmentId: _written, ...citation }) => {
      const attachmentId = stored.get(citation.path);
      return formatVisualizeCitation(
        attachmentId === undefined ? citation : { ...citation, attachmentId },
      );
    });
  },
);
