import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import {
  clampHtmlRenderHeight,
  htmlRenderFileName,
  type HtmlRenderReference,
} from "@t3tools/shared/htmlRender";
import { VISUALIZE_FOLLOW_UP_METHOD } from "@t3tools/shared/visualize";
import { Maximize2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAssetUrlRefresh, useAssetUrlState } from "~/assets/assetUrls";
import { useComposerHandleContext } from "~/composerHandleContext";

import { HtmlRenderDocument } from "../files/BrowserDocumentFrame";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { HtmlRenderDialog } from "./HtmlRenderDialog";

/** Custom build: the prompt a page's follow-up button posted, if `data` is one. */
function readFollowUpPrompt(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const { jsonrpc, method, params } = data as Record<string, unknown>;
  if (jsonrpc !== "2.0" || method !== VISUALIZE_FOLLOW_UP_METHOD) return undefined;
  const prompt = (params as { prompt?: unknown } | null)?.prompt;
  return typeof prompt === "string" && prompt.trim() !== "" ? prompt.slice(0, 4_000) : undefined;
}

/**
 * A stored Visualize page inline in a reply. Nothing measured it ahead of
 * time, so the frame holds the reference's height until the page reports its
 * own, then fits it. Shows `fallback` when the page cannot be loaded.
 */
export function VisualizeFrame(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | undefined;
  readonly render: HtmlRenderReference;
  readonly fallback: ReactNode;
}) {
  const { attachmentId, title } = props.render;
  const resource = useMemo(
    () => ({
      _tag: "attachment" as const,
      attachmentId,
      fileName: htmlRenderFileName(title),
      mimeType: "text/html",
      disposition: "inline" as const,
    }),
    [attachmentId, title],
  );
  const assetUrl = useAssetUrlState(props.environmentId, resource);
  // The page keeps its first URL: a re-minted one would reload it and drop its state.
  const [src, setSrc] = useState<string | null>(null);
  if (src === null && assetUrl._tag === "Success") setSrc(assetUrl.url);
  const [contentHeight, setContentHeight] = useState<number>();
  // Custom build: full screen, and follow-up prompts drafted in the composer.
  const refresh = useAssetUrlRefresh(props.environmentId, resource);
  const [expandedSrc, setExpandedSrc] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const composerRef = useComposerHandleContext();
  const expanded = expandedSrc !== null;
  useEffect(() => {
    // Gated like a page's link: its own focused frame, right after the reader used it.
    const draftFollowUp = (event: MessageEvent) => {
      const prompt = readFollowUpPrompt(event.data);
      const frame = document.activeElement;
      if (
        prompt === undefined ||
        !(frame instanceof HTMLIFrameElement) ||
        frame.contentWindow !== event.source ||
        !(expanded || boxRef.current?.contains(frame)) ||
        navigator.userActivation?.isActive === false
      ) {
        return;
      }
      if (composerRef?.current?.insertTextAtEnd(prompt, { ensureLeadingBoundary: true })) {
        setExpandedSrc(null);
        composerRef.current.focusAtEnd();
      } else {
        toastManager.add({ type: "error", title: "Unable to add to chat" });
      }
    };
    window.addEventListener("message", draftFollowUp);
    return () => window.removeEventListener("message", draftFollowUp);
  }, [composerRef, expanded]);
  if (src === null && assetUrl._tag === "Failure") return props.fallback;
  return (
    <div
      ref={boxRef}
      className="group/visualize relative my-[0.65rem]"
      style={{ height: clampHtmlRenderHeight(contentHeight ?? props.render.height) }}
    >
      {src !== null ? (
        <>
          <HtmlRenderDocument
            src={src}
            title={title}
            threadRef={props.threadRef}
            className="block size-full"
            onContentHeight={setContentHeight}
          />
          <div className="absolute end-2 top-2 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/visualize:opacity-100 pointer-coarse:opacity-100">
            <Button
              aria-label="Open full screen"
              size="icon-xs"
              variant="glass"
              onClick={() =>
                void refresh().then(
                  (url) => setExpandedSrc(url ?? src),
                  () => {},
                )
              }
            >
              <Maximize2Icon className="size-3.5" />
            </Button>
          </div>
          {expandedSrc !== null ? (
            <HtmlRenderDialog
              src={expandedSrc}
              title={title}
              threadRef={props.threadRef}
              onClose={() => setExpandedSrc(null)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
