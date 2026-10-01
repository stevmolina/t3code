import type { EnvironmentId } from "@t3tools/contracts";
import type { VisualizeCitation } from "@t3tools/shared/visualize";
import { XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useAssetUrlState } from "../assets/assetUrls";
import { isContextMenuOpen } from "../contextMenuFallback";
import { cn } from "../lib/utils";
import { composerFloatingLayerProps } from "./chat/composerEventScope";
import { Button } from "./ui/button";

/**
 * Hosts an agent-written visualization page in a sandboxed frame.
 *
 * The server serves the page (fragment plus runtime) under its own sandbox
 * policy, so the frame has an opaque origin and none of the app's session or
 * storage. This side implements the host half of the Codex visualization
 * bridge: it hands the page a MessagePort on load, then answers height,
 * widget-state, follow-up, link, and scroll requests that arrive on it.
 */

const MAX_FRAME_HEIGHT = 10_000;
const MAX_WIDGET_STATE_BYTES = 16 * 1024;
const WIDGET_STATE_STORAGE_PREFIX = "t3code:visualization-widget-state:v1:";

/** Theme variables the page reads; values come from the app's computed root style. */
const THEME_VARIABLES = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--border",
  "--input",
  "--ring",
  "--font-sans",
  "--font-mono",
] as const;

// The chat list unmounts off-screen rows; remembering the last height keeps a
// remounted visual from collapsing and jumping the scroll position.
const MAX_REMEMBERED_HEIGHTS = 100;
const rememberedHeights = new Map<string, number>();

function rememberHeight(key: string, height: number) {
  rememberedHeights.delete(key);
  rememberedHeights.set(key, height);
  if (rememberedHeights.size > MAX_REMEMBERED_HEIGHTS) {
    const oldest = rememberedHeights.keys().next().value;
    if (oldest !== undefined) rememberedHeights.delete(oldest);
  }
}

function readThemeVariables(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const variables: Record<string, string> = {};
  for (const name of THEME_VARIABLES) {
    const value = style.getPropertyValue(name).trim();
    if (value.length > 0) variables[name] = value;
  }
  return variables;
}

function readWidgetState(storageKey: string): Record<string, unknown> | null {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === null) return null;
    const parsed: unknown = JSON.parse(saved);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Persists one widget-state snapshot. Invalid, oversized, or unwritable state is refused. */
function writeWidgetState(storageKey: string, serialized: unknown): boolean {
  if (
    typeof serialized !== "string" ||
    new TextEncoder().encode(serialized).length > MAX_WIDGET_STATE_BYTES
  ) {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    localStorage.setItem(storageKey, serialized);
    return true;
  } catch {
    return false;
  }
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function nearestScrollContainer(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    const overflowY = getComputedStyle(parent).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      parent.scrollHeight > parent.clientHeight
    )
      return parent;
  }
  return null;
}

interface VisualizationFrameProps {
  readonly citation: VisualizeCitation;
  readonly environmentId: EnvironmentId;
  /** Scopes saved widget state; visuals outside a thread share the environment's. */
  readonly threadId: string | null;
  readonly theme: "light" | "dark";
  readonly onUnavailable: () => void;
  readonly onFollowUp?: ((prompt: string) => void) | undefined;
  readonly onOpenLink?: ((url: string) => void) | undefined;
  readonly className?: string;
}

export function VisualizationFrame(props: VisualizationFrameProps) {
  const { citation, environmentId, threadId, theme, onUnavailable, onFollowUp, onOpenLink } = props;
  const resource = useMemo(
    () => ({ _tag: "visualization" as const, path: citation.path }),
    [citation.path],
  );
  const assetUrl = useAssetUrlState(environmentId, resource);
  // Signed URLs refresh in the background; keep the first one so a refresh
  // never reloads a page the user is interacting with.
  const [src, setSrc] = useState<string | null>(null);
  if (src === null && assetUrl._tag === "Success") setSrc(assetUrl.url);
  const failed = src === null && assetUrl._tag === "Failure";
  useEffect(() => {
    if (failed) onUnavailable();
  }, [failed, onUnavailable]);

  const identity = `${environmentId}:${threadId ?? ""}:${citation.path}`;
  const storageKey = WIDGET_STATE_STORAGE_PREFIX + identity;
  const [height, setHeight] = useState<number | null>(
    () => rememberedHeights.get(identity) ?? null,
  );
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const portRef = useRef<MessagePort | null>(null);
  // Port and window listeners outlive renders; they read the latest props here.
  const handlersRef = useRef({
    onUnavailable,
    onFollowUp,
    onOpenLink,
    storageKey,
    identity,
    theme,
  });
  useEffect(() => {
    handlersRef.current = { onUnavailable, onFollowUp, onOpenLink, storageKey, identity, theme };
  });

  const handlePortMessage = useCallback((event: MessageEvent) => {
    const data: unknown = event.data;
    if (data === null || typeof data !== "object") return;
    const message = data as Record<string, unknown>;
    const handlers = handlersRef.current;
    switch (message.type) {
      case "height": {
        const next = message.height;
        if (typeof next === "number" && Number.isFinite(next) && next >= 0) {
          const clamped = Math.min(Math.ceil(next), MAX_FRAME_HEIGHT);
          rememberHeight(handlers.identity, clamped);
          setHeight(clamped);
        }
        return;
      }
      case "widget-state-write": {
        if (!Number.isSafeInteger(message.id)) return;
        portRef.current?.postMessage({
          type: "widget-state-result",
          id: message.id,
          ok: writeWidgetState(handlers.storageKey, message.state),
        });
        return;
      }
      case "follow-up": {
        // The page only sends this from a user gesture; the prompt lands in
        // the composer, so the user still decides whether it goes out.
        if (typeof message.prompt === "string" && message.prompt.trim().length > 0) {
          handlers.onFollowUp?.(message.prompt.trim());
        }
        return;
      }
      case "open-external": {
        const url = httpsUrl(message.href);
        if (url !== null) handlers.onOpenLink?.(url);
        return;
      }
      case "scroll-to": {
        const top = message.top;
        const frame = frameRef.current;
        if (typeof top !== "number" || !Number.isFinite(top) || frame === null) return;
        const container = nearestScrollContainer(frame);
        if (container === null) return;
        const offset =
          frame.getBoundingClientRect().top - container.getBoundingClientRect().top + top;
        container.scrollBy({ top: offset });
        return;
      }
    }
  }, []);

  const handleLoad = useCallback(() => {
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    portRef.current?.close();
    const channel = new MessageChannel();
    channel.port1.addEventListener("message", handlePortMessage);
    channel.port1.start();
    portRef.current = channel.port1;
    let statePersistence: "local" | "none" = "none";
    try {
      statePersistence = typeof localStorage === "undefined" ? "none" : "local";
    } catch {
      statePersistence = "none";
    }
    frameWindow.postMessage(
      {
        type: "codex-visualization-initialize",
        globals: {
          theme: handlersRef.current.theme,
          variables: readThemeVariables(),
          widgetState: readWidgetState(handlersRef.current.storageKey),
          statePersistence,
        },
      },
      "*",
      [channel.port2],
    );
  }, [handlePortMessage]);

  useEffect(() => {
    portRef.current?.postMessage({ type: "theme", theme, variables: readThemeVariables() });
  }, [theme]);

  // A page whose fragment vanished after its URL was issued reports it here.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== null &&
        event.source === frameRef.current?.contentWindow &&
        (event.data as { type?: unknown } | null)?.type === "codex-visualization-unavailable"
      ) {
        handlersRef.current.onUnavailable();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(
    () => () => {
      portRef.current?.close();
      portRef.current = null;
    },
    [],
  );

  return (
    <div
      className={props.className}
      data-visualize-mode={citation.mode}
      style={{ minHeight: height ?? 64 }}
    >
      {src === null ? null : (
        <iframe
          ref={frameRef}
          src={src}
          title={citation.title ?? "Visualization"}
          // Scripts only: no same-origin, forms, popups, modals, or top navigation.
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className={cn("block w-full border-0 bg-transparent", height === null && "invisible")}
          style={{ height: height ?? 0, colorScheme: theme }}
          onLoad={handleLoad}
        />
      )}
    </div>
  );
}

/** The expandable surface for wide visuals, up to 1,024px across. */
export function VisualizationDialog(props: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const { onClose } = props;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const opener = document.activeElement;
    closeButtonRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !isContextMenuOpen()) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [onClose]);

  const dialog = (
    <div
      {...composerFloatingLayerProps}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-4 py-6 [-webkit-app-region:no-drag]"
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-zoom-out"
        aria-label="Close visualization"
        tabIndex={-1}
        onClick={onClose}
      />
      <div className="relative isolate z-10 flex max-h-[92vh] w-[min(1024px,92vw)] flex-col">
        <div className="mb-2 flex items-center justify-end">
          <Button
            type="button"
            size="icon-xs"
            variant="media-close"
            onClick={onClose}
            aria-label="Close visualization"
            ref={closeButtonRef}
          >
            <XIcon />
          </Button>
        </div>
        <div className="min-h-0 overflow-auto rounded-lg border border-border/70 bg-background p-4 shadow-2xl">
          {props.children}
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
