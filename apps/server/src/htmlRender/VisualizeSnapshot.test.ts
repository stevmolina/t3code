import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import { findVisualizeCitations, formatVisualizeCitation } from "@t3tools/shared/visualize";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveAttachmentPathById } from "../attachmentStore.ts";
import { snapshotVisualizeCitations } from "./VisualizeSnapshot.ts";

const threadId = ThreadId.make("thread-visualize");

const setup = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const attachmentsDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-visualize-" });
  const fragmentsDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-fragments-" });
  const write = (name: string, content: string) =>
    fileSystem
      .writeFileString(path.join(fragmentsDir, name), content)
      .pipe(Effect.as(path.join(fragmentsDir, name)));
  const snapshot = (text: string) => snapshotVisualizeCitations({ attachmentsDir, threadId, text });
  const stored = (text: string) =>
    Effect.forEach(findVisualizeCitations(text), ({ attachmentId }) =>
      attachmentId === undefined
        ? Effect.succeed(undefined)
        : fileSystem.readFileString(resolveAttachmentPathById({ attachmentsDir, attachmentId })!),
    );
  return { fileSystem, write, snapshot, stored };
});

describe("snapshotVisualizeCitations", () => {
  it.effect("stores each cited fragment as a themed page under the thread's policy", () =>
    Effect.gen(function* () {
      const { fileSystem, write, snapshot, stored } = yield* setup;
      const chart = yield* write("chart.html", '<div id="chart" class="card">42</div>');
      const text = yield* snapshot(`Revenue:\n${formatVisualizeCitation({ path: chart })}\nUp.`);

      const [citation] = findVisualizeCitations(text);
      expect(citation?.attachmentId).toMatch(/^thread-visualize-[0-9a-f-]{36}-html$/);
      const [page] = yield* stored(text);
      expect(page).toContain('<div id="chart" class="card">42</div>');
      expect(page).toContain('<style id="t3-theme">');
      expect(page).toContain("connect-src 'none'");
      expect(page).toContain("https://cdn.jsdelivr.net");
      expect(page).toContain("t3/visualize/follow-up");

      // The reply keeps what it showed when the agent rewrites the file, and
      // completing the same reply again stores no second page.
      expect(yield* snapshot(`Revenue:\n${formatVisualizeCitation({ path: chart })}\nUp.`)).toBe(
        text,
      );
      yield* fileSystem.writeFileString(chart, "<p>changed</p>");
      expect(yield* stored(text)).toEqual([page]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps a citation without a page when its file is missing or not a fragment", () =>
    Effect.gen(function* () {
      const { write, snapshot } = yield* setup;
      const document = yield* write("page.html", "<!doctype html><html><body>x</body></html>");
      const text = [
        formatVisualizeCitation({ path: document }),
        formatVisualizeCitation({ path: "/nonexistent/chart.html", attachmentId: "forged-html" }),
      ].join("\n");

      expect(findVisualizeCitations(yield* snapshot(text))).toEqual([
        { path: document },
        { path: "/nonexistent/chart.html" },
      ]);
      expect(yield* snapshot("No visuals here.")).toBe("No visuals here.");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
