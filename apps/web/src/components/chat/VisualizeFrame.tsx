import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import {
  clampHtmlRenderHeight,
  htmlRenderFileName,
  type HtmlRenderReference,
} from "@t3tools/shared/htmlRender";
import { useMemo, useState, type ReactNode } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";

import { HtmlRenderDocument } from "../files/BrowserDocumentFrame";

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
  if (src === null && assetUrl._tag === "Failure") return props.fallback;
  return (
    <div
      className="my-[0.65rem]"
      style={{ height: clampHtmlRenderHeight(contentHeight ?? props.render.height) }}
    >
      {src !== null ? (
        <HtmlRenderDocument
          src={src}
          title={title}
          threadRef={props.threadRef}
          className="block size-full"
          onContentHeight={setContentHeight}
        />
      ) : null}
    </div>
  );
}
