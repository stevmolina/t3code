import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { act, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  resources: [] as Array<unknown>,
  assetState: "success" as "success" | "failure",
}));

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null }));
vi.mock("../assets/assetUrls", () => ({
  useAssetUrlRefresh: () => vi.fn(),
  useAssetUrlState: (_environmentId: unknown, resource: unknown) => {
    testState.resources.push(resource);
    return testState.assetState === "failure"
      ? { _tag: "Failure" }
      : { _tag: "Success", url: "https://env.test/api/assets/signed/chart.html" };
  },
}));
vi.mock("../hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("./ui/tooltip", async () => {
  const { cloneElement, isValidElement } = await import("react");
  return {
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipTrigger({
      render,
      children,
    }: ComponentProps<typeof import("./ui/tooltip").TooltipTrigger>) {
      if (!isValidElement(render)) return <>{children}</>;
      return children === undefined ? render : cloneElement(render, undefined, children);
    },
    TooltipPopup: () => null,
  };
});
vi.mock("../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => vi.fn() }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../state/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/session")>()),
  useEnvironmentScope: () => true,
  readEnvironmentScope: () => true,
  usePreparedConnection: () => ({ _tag: "Loading" }),
}));
vi.mock("../state/entities", () => ({
  readThreadShell: () => null,
  useProjects: () => [],
  useServerConfigs: () => new Map(),
}));
vi.mock("../remoteOpen", () => ({
  useRemoteOpenResolution: () => ({ state: { mode: "local-exec" }, isResolved: true }),
}));
vi.mock("../editorPreferences", () => ({
  useOpenInPreferredEditor: () => vi.fn(),
  usePreferredEditor: () => [null, vi.fn()],
}));
vi.mock("~/lib/openPullRequestLink", () => ({
  findProjectOnChangeRequestHost: () => undefined,
  parseChangeRequestUrl: () => null,
  resolvePullRequestPreviewTarget: () => null,
  useOpenChangeRequestLink: () => vi.fn(),
}));

import ChatMarkdown from "./ChatMarkdown";

const threadRef = {
  environmentId: EnvironmentId.make("env-local"),
  threadId: ThreadId.make("thread-1"),
};
const FRAGMENT_PATH = "/state/visualizations/thread-1/chart.html";
const reference = (payload: object) => `visualize${JSON.stringify(payload)}`;

function renderAssistant(text: string, isStreaming = false) {
  return renderToStaticMarkup(
    <ChatMarkdown
      cwd={undefined}
      threadRef={threadRef}
      text={text}
      isStreaming={isStreaming}
      renderVisualizations
    />,
  );
}

beforeEach(() => {
  testState.resources = [];
  testState.assetState = "success";
});

describe("ChatMarkdown visualizations", () => {
  it("renders a finished reference as a scripts-only sandboxed frame", () => {
    const html = renderAssistant(
      `Here is the handshake.\n${reference({ path: FRAGMENT_PATH, title: "TCP handshake" })}\nDone.`,
    );
    const frame = /<iframe[^>]*>/.exec(html)?.[0] ?? "";
    expect(frame).toContain('sandbox="allow-scripts"');
    expect(frame).toContain('src="https://env.test/api/assets/signed/chart.html"');
    expect(frame).toContain('title="TCP handshake"');
    expect(frame).not.toContain("allow-same-origin");
    expect(frame).not.toContain("srcdoc");
    expect(html).toContain('data-visualize="page"');
    expect(html).toContain("Here is the handshake.");
    expect(html).toContain("Done.");
    expect(testState.resources).toContainEqual({ _tag: "visualization", path: FRAGMENT_PATH });
  });

  it("never puts fragment markup or scripts into the app page", () => {
    // The parent only names the file; the server serves its contents to the frame.
    const html = renderAssistant(reference({ path: FRAGMENT_PATH }));
    expect(html).not.toContain("<script");
    expect(html.match(/<iframe/g)).toHaveLength(1);
  });

  it("shows the reference source while the reply streams", () => {
    const html = renderAssistant(reference({ path: FRAGMENT_PATH }), true);
    expect(html).not.toContain("<iframe");
    expect(html).toContain("visualize");
  });

  it("recognizes wide mode and offers the expanded surface", () => {
    const html = renderAssistant(reference({ path: FRAGMENT_PATH, mode: "wide" }));
    expect(html).toContain('data-visualize-mode="wide"');
    expect(html).toContain('aria-label="Expand visualization"');
    expect(renderAssistant(reference({ path: FRAGMENT_PATH }))).not.toContain(
      "Expand visualization",
    );
  });

  it("still strips scripts and event handlers from ordinary assistant HTML", () => {
    const html = renderAssistant(
      '<div onclick="alert(1)">hi</div>\n\n<script>alert(2)</script>\n\n<img src="x" onerror="alert(3)">',
    );
    expect(html).toContain("hi");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onerror");
  });

  it("keeps user-message HTML and references as source text", () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown
        cwd={undefined}
        threadRef={threadRef}
        text={`<b>bold</b>\n${reference({ path: FRAGMENT_PATH })}`}
        parseRawHtml={false}
        lineBreaks
      />,
    );
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain("<iframe");
    expect(testState.resources).toEqual([]);
  });

  it("falls back to the reference source when the file cannot be served", async () => {
    testState.assetState = "failure";
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let renderer: ReactTestRenderer | undefined;
    try {
      await act(async () => {
        renderer = create(
          <ChatMarkdown
            cwd={undefined}
            threadRef={threadRef}
            text={reference({ path: FRAGMENT_PATH })}
            renderVisualizations
          />,
        );
      });
      expect(renderer!.root.findAllByType("iframe")).toHaveLength(0);
      const block = renderer!.root.find(
        (node) => typeof node.type === "string" && node.props["data-visualize"] !== undefined,
      );
      expect(block.props["data-visualize"]).toBe("source");
      expect(JSON.stringify(renderer!.toJSON())).toContain(FRAGMENT_PATH);
    } finally {
      await act(async () => renderer?.unmount());
      vi.unstubAllGlobals();
    }
  });
});
