import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, MessageId, ThreadId, type WorktreeSetupSnapshot } from "@t3tools/contracts";
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

import { useWorktreeSetup } from "../components/chat/useWorktreeSetup";
import type { ChatMessage } from "../types";
import { useIncrementalTimelineEntries } from "./useIncrementalTimelineEntries";

const query = vi.hoisted(() => ({ data: undefined as WorktreeSetupSnapshot | null | undefined }));
vi.mock("../state/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/query")>()),
  useEnvironmentQuery: () => query,
}));
vi.mock("../state/use-atom-command", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/use-atom-command")>()),
  useAtomCommand: () => vi.fn(),
}));

let root: Root;
let timeline: ReturnType<typeof useIncrementalTimelineEntries>;
let setup: ReturnType<typeof useWorktreeSetup>;
const threadId = ThreadId.make("draft-thread");
const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");
const message = {
  id: MessageId.make("message"),
  role: "user",
  text: "Start this draft",
  runId: null,
  streaming: false,
  createdAt: "2026-10-20T20:00:00.000Z",
  updatedAt: "2026-10-20T20:00:00.000Z",
} satisfies ChatMessage;

function TimelineProbe({ threadKey = "local:draft", text = "Start this draft" }) {
  // oxlint-disable-next-line t3code/no-manual-memo -- Match ChatView callers that allocate timeline collections on every render.
  "use no memo";
  const entries = useIncrementalTimelineEntries(threadKey, {
    visibleTurnItems: [],
    optimisticMessages: [{ ...message, text }],
    anchoredMessages: [],
    attachmentUrlById: new Map(),
  });
  useLayoutEffect(() => {
    timeline = entries;
  });
  return null;
}

function SetupProbe({ environmentId = local }) {
  // oxlint-disable-next-line t3code/no-manual-memo -- Match scopeThreadRef allocating a new value in ChatView on every render.
  "use no memo";
  const value = useWorktreeSetup({
    routeThreadRef: scopeThreadRef(environmentId, threadId),
    ownerKey: "draft",
    activeThread: undefined,
    threadRef: null,
    serverProjection: null,
    activityRun: null,
    localPreparing: false,
    sendQueuesBehindSetup: false,
    followUpSent: false,
  });
  useLayoutEffect(() => {
    setup = value;
  });
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  query.data = undefined;
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});

it("renders fresh draft timeline collections without scheduling a render loop", async () => {
  await act(() => root.render(<TimelineProbe />));
  await act(() => root.render(<TimelineProbe />));
  expect(timeline).toMatchObject([{ kind: "message", message: { text: "Start this draft" } }]);
  await act(() => root.render(<TimelineProbe text="Updated draft" />));
  expect(timeline).toMatchObject([{ kind: "message", message: { text: "Updated draft" } }]);
  await act(() => root.render(<TimelineProbe threadKey="remote:draft" text="Remote draft" />));
  expect(timeline).toMatchObject([{ kind: "message", message: { text: "Remote draft" } }]);
});

it("renders recreated draft route references while setup has not started", async () => {
  await act(() => root.render(<SetupProbe />));
  await act(() => root.render(<SetupProbe />));
  expect(setup.worktreeSetup).toBeNull();
  expect(setup.blocksSend).toBe(false);
});

it("holds setup across equivalent route values and clears it for another environment", async () => {
  const snapshot = {
    threadId,
    phase: "running",
    startedAt: "2026-10-20T20:00:00.000Z",
    endedAt: null,
    branch: "feature",
    baseRef: "main",
    worktreePath: null,
    setupScript: null,
    stages: [],
    error: null,
    sequence: 1,
  } satisfies WorktreeSetupSnapshot;
  query.data = snapshot;
  await act(() => root.render(<SetupProbe />));
  query.data = null;
  await act(() => root.render(<SetupProbe />));
  expect(setup.worktreeSetup).toEqual(snapshot);
  await act(() => root.render(<SetupProbe environmentId={remote} />));
  expect(setup.worktreeSetup).toBeNull();
});
