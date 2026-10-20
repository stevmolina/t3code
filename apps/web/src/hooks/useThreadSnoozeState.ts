import {
  effectiveSnoozed,
  threadWokeAt,
  type ThreadSnoozeShell,
} from "@t3tools/client-runtime/state/thread-settled";
import { useEffect, useState } from "react";

export function useThreadSnoozeState(
  threadKey: string | null,
  shell: ThreadSnoozeShell | null,
  supported: boolean,
) {
  const snoozedAt = shell?.snoozedAt ?? null;
  const snoozedUntil = shell?.snoozedUntil ?? null;
  // Detail hydration may rebuild the shell every render. Reset the clock
  // only when the thread or its snooze changes, never on object identity.
  const [clock, setClock] = useState(() => ({
    threadKey,
    snoozedAt,
    snoozedUntil,
    now: new Date().toISOString(),
  }));
  if (
    clock.threadKey !== threadKey ||
    clock.snoozedAt !== snoozedAt ||
    clock.snoozedUntil !== snoozedUntil
  ) {
    setClock({ threadKey, snoozedAt, snoozedUntil, now: new Date().toISOString() });
  }
  const now = clock.now;
  const snoozed = shell !== null && supported && effectiveSnoozed(shell, { now });
  useEffect(() => {
    if (!snoozed) return;
    const wakeAtMs = Date.parse(snoozedUntil ?? "");
    if (!Number.isFinite(wakeAtMs)) return;
    const id = setTimeout(
      () => setClock((current) => ({ ...current, now: new Date().toISOString() })),
      Math.min(Math.max(0, wakeAtMs - Date.now()) + 50, 2_147_483_647),
    );
    return () => clearTimeout(id);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Re-arm if timer clamping or clock skew fires before the deadline.
  }, [snoozedUntil, snoozed, now]);

  return {
    snoozed,
    wokeAt: shell !== null && supported ? threadWokeAt(shell, { now }) : null,
  };
}
