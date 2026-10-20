import { useState } from "react";
import {
  deriveTimelineEntriesFromVisibleTurnItemsWithState,
  type TimelineEntriesInput,
  type TimelineEntriesProjection,
} from "../session-logic";

function sameInput(left: TimelineEntriesInput, right: TimelineEntriesInput): boolean {
  return (
    left.visibleTurnItems === right.visibleTurnItems &&
    left.optimisticMessages === right.optimisticMessages &&
    left.anchoredMessages === right.anchoredMessages &&
    left.attachmentUrlById === right.attachmentUrlById &&
    left.attempts === right.attempts &&
    left.nodes === right.nodes &&
    left.plans === right.plans
  );
}

function createTimelineDerivation() {
  let previous: { threadKey: string | null; projection: TimelineEntriesProjection } | null = null;
  return (threadKey: string | null, input: TimelineEntriesInput) => {
    if (previous?.threadKey === threadKey && sameInput(previous.projection.input, input)) {
      return previous.projection.entries;
    }
    const projection = deriveTimelineEntriesFromVisibleTurnItemsWithState(
      input,
      previous?.threadKey === threadKey ? previous.projection : null,
    );
    previous = { threadKey, projection };
    return projection.entries;
  };
}

/**
 * Timeline entries for a thread, derived from the previous projection so
 * unchanged rows keep their identity and memoized rows skip rendering. A new
 * thread starts from scratch.
 */
export function useIncrementalTimelineEntries(
  threadKey: string | null,
  input: TimelineEntriesInput,
): TimelineEntriesProjection["entries"] {
  // Each mounted timeline owns a derivation cache. Fresh input collections
  // update the cache without scheduling another React render.
  const [derive] = useState(createTimelineDerivation);
  return derive(threadKey, input);
}
