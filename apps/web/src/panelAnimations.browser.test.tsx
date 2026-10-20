import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { usePanelNavigationSuppression, usePanelPresence } from "./panelAnimations";

let root: Root;
let pendingFrames: FrameRequestCallback[] = [];
let observed: boolean[] = [];
let presence: { present: boolean; value: { surface: string | null } | null } | null = null;

function SuppressionProbe({ navigationKey }: { navigationKey: string }) {
  const suppressed = usePanelNavigationSuppression(navigationKey);
  useLayoutEffect(() => {
    observed.push(suppressed);
  }, [suppressed]);
  return null;
}

function PresenceProbe({ open, surface }: { open: boolean; surface: string | null }) {
  // oxlint-disable-next-line t3code/no-manual-memo -- Reproduce a caller that builds the panel value during render.
  "use no memo";
  const result = usePanelPresence(open, { surface }, true, "local:thread", 150);
  useLayoutEffect(() => {
    presence = result;
  });
  return null;
}

beforeEach(() => {
  pendingFrames = [];
  observed = [];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // Frames are stepped by hand so each assertion lands between two paints.
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    pendingFrames.push(callback);
    return pendingFrames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function paintPendingFrame() {
  const callback = pendingFrames.shift();
  await act(() => callback?.(0));
}

describe("usePanelNavigationSuppression", () => {
  it("suppresses initial and navigated panel state until each route has painted", async () => {
    await act(() => root.render(<SuppressionProbe navigationKey="/thread/one" />));
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);

    await act(() => root.render(<SuppressionProbe navigationKey="/thread/two" />));
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);
  });
});

describe("usePanelPresence", () => {
  it("renders an open panel whose value is rebuilt every render", async () => {
    await act(() => root.render(<PresenceProbe open surface="pull-request" />));
    await act(() => root.render(<PresenceProbe open surface="pull-request" />));
    expect(presence).toEqual({ present: true, value: { surface: "pull-request" } });
  });

  it("keeps the last open value while the panel animates closed", async () => {
    vi.useFakeTimers();
    await act(() => root.render(<PresenceProbe open surface="pull-request" />));
    await act(() => root.render(<PresenceProbe open surface="files" />));
    await act(() => root.render(<PresenceProbe open={false} surface={null} />));
    expect(presence).toEqual({ present: true, value: { surface: "files" } });
    await act(() => vi.advanceTimersByTime(150));
    expect(presence).toEqual({ present: false, value: null });
    vi.useRealTimers();
  });
});
