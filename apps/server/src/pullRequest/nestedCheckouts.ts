import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

/** Deep enough for `engagements/<client>/projects/<repo>` below a workspace folder. */
const MAX_DEPTH = 4;
/** Directories looked at before giving up, so a project rooted at a home folder stays cheap. */
const MAX_DIRECTORIES = 2_000;

/**
 * Git checkouts below `root`, nearest first. A project is often a folder that holds several
 * clones rather than a repository itself; this finds them so a pull request can be read from
 * the clone that owns it. Hidden folders and `node_modules` are skipped, and a checkout is not
 * searched further.
 */
export const findNestedCheckouts = Effect.fn("findNestedCheckouts")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const found: string[] = [];
  let frontier = [root];
  let visited = 0;
  for (let depth = 1; depth <= MAX_DEPTH && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const directory of frontier) {
      const names = yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed(() => []));
      for (const name of names.toSorted()) {
        if (name.startsWith(".") || name === "node_modules") continue;
        const child = path.join(directory, name);
        const info = yield* fs.stat(child).pipe(Effect.option);
        if (info._tag === "None" || info.value.type !== "Directory") continue;
        visited += 1;
        if (visited > MAX_DIRECTORIES) return found;
        const isCheckout = yield* fs
          .exists(path.join(child, ".git"))
          .pipe(Effect.orElseSucceed(() => false));
        if (isCheckout) found.push(child);
        else next.push(child);
      }
    }
    frontier = next;
  }
  return found;
});
