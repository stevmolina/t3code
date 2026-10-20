import { useLayoutEffect } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../test/render";
import { usePanelNavigationSuppression, usePanelPresence } from "./panelAnimations";

function SuppressionProbe({
  navigationKey,
  observed,
}: {
  navigationKey: string;
  observed: boolean[];
}) {
  const suppressed = usePanelNavigationSuppression(navigationKey);
  useLayoutEffect(() => {
    observed.push(suppressed);
  }, [observed, suppressed]);
  return null;
}

type Presence = { present: boolean; value: { surface: string | null } | null };

function PresenceProbe({
  open,
  surface,
  observed,
}: {
  open: boolean;
  surface: string | null;
  observed: Presence[];
}) {
  // oxlint-disable-next-line t3code/no-manual-memo -- Reproduce a caller that builds the panel value during render.
  "use no memo";
  const result = usePanelPresence(open, { surface }, true, "local:thread", 150);
  useLayoutEffect(() => {
    observed.push(result);
  });
  return null;
}

describe("usePanelNavigationSuppression", () => {
  it("suppresses initial and navigated panel state until each route has painted", async () => {
    const pendingFrames: FrameRequestCallback[] = [];
    const observed: boolean[] = [];
    // Frames are stepped by hand so each assertion lands between two paints.
    using _requestFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => pendingFrames.push(callback));
    using _cancelFrame = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);
    const paintPendingFrame = async () => {
      const callback = pendingFrames.shift();
      await act(() => callback?.(0));
    };

    await using screen = await render(
      <SuppressionProbe navigationKey="/thread/one" observed={observed} />,
    );
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);

    await screen.rerender(<SuppressionProbe navigationKey="/thread/two" observed={observed} />);
    expect(observed.at(-1)).toBe(true);

    await paintPendingFrame();
    expect(observed.at(-1)).toBe(true);
    await paintPendingFrame();
    expect(observed.at(-1)).toBe(false);
  });
});

describe("usePanelPresence", () => {
  it("renders an open panel whose value is rebuilt every render", async () => {
    const observed: Presence[] = [];
    await using screen = await render(
      <PresenceProbe open surface="pull-request" observed={observed} />,
    );
    await screen.rerender(<PresenceProbe open surface="pull-request" observed={observed} />);
    expect(observed.at(-1)).toEqual({ present: true, value: { surface: "pull-request" } });
  });

  it("keeps the last open value while the panel animates closed", async () => {
    const observed: Presence[] = [];
    await using screen = await render(
      <PresenceProbe open surface="pull-request" observed={observed} />,
    );
    using _timers = fakeTimers();
    await screen.rerender(<PresenceProbe open surface="files" observed={observed} />);
    await screen.rerender(<PresenceProbe open={false} surface={null} observed={observed} />);
    expect(observed.at(-1)).toEqual({ present: true, value: { surface: "files" } });
    await act(() => vi.advanceTimersByTime(150));
    expect(observed.at(-1)).toEqual({ present: false, value: null });
  });
});
