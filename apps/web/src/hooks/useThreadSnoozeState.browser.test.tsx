import type { ThreadSnoozeShell } from "@t3tools/client-runtime/state/thread-settled";
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useThreadSnoozeState } from "./useThreadSnoozeState";

let root: Root;
let state: ReturnType<typeof useThreadSnoozeState>;
const wakeAt = "2026-10-20T20:01:00.000Z";
const shell = {
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  snoozedAt: "2026-10-20T20:00:00.000Z",
  snoozedUntil: wakeAt,
} satisfies ThreadSnoozeShell;

function Probe({
  threadKey = "local:thread",
  value = shell,
  supported = true,
}: {
  threadKey?: string;
  value?: ThreadSnoozeShell;
  supported?: boolean;
}) {
  // oxlint-disable-next-line t3code/no-manual-memo -- Reproduce a caller that rebuilds fallback shells during render.
  "use no memo";
  // Detail hydration rebuilds the fallback shell on every render, including
  // renders triggered by the clock itself.
  const result = useThreadSnoozeState(threadKey, { ...value }, supported);
  useLayoutEffect(() => {
    state = result;
  });
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime("2026-10-20T20:00:00.000Z");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("keeps rendering hydrated detail shells and wakes at the deadline", async () => {
  await act(() => root.render(<Probe />));
  await act(() => root.render(<Probe />));
  expect(state).toEqual({ snoozed: true, wokeAt: null });
  await act(() => vi.advanceTimersByTime(60_050));
  expect(state).toEqual({ snoozed: false, wokeAt: wakeAt });
});

it("opens an existing chat that has never been snoozed", async () => {
  const value = { ...shell, snoozedAt: null, snoozedUntil: null };
  await act(() => root.render(<Probe value={value} />));
  await act(() => root.render(<Probe value={value} />));
  expect(state).toEqual({ snoozed: false, wokeAt: null });
});

it("refreshes the clock when switching environments after a deadline", async () => {
  await act(() => root.render(<Probe supported={false} />));
  await act(() => vi.advanceTimersByTime(60_050));
  await act(() => root.render(<Probe threadKey="remote:thread" />));
  expect(state).toEqual({ snoozed: false, wokeAt: wakeAt });
});

it("replaces the wake timer when the snooze deadline changes", async () => {
  await act(() => root.render(<Probe />));
  const later = "2026-10-20T20:02:00.000Z";
  await act(() => root.render(<Probe value={{ ...shell, snoozedUntil: later }} />));
  await act(() => vi.advanceTimersByTime(60_050));
  expect(state).toEqual({ snoozed: true, wokeAt: null });
  await act(() => vi.advanceTimersByTime(60_000));
  expect(state).toEqual({ snoozed: false, wokeAt: later });
});
