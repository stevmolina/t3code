import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

/** Deep enough for `engagements/<client>/projects/<repo>` below a project folder. */
const MAX_DEPTH = 4;
/** Directories looked at before giving up, so a project rooted at a home folder stays cheap. */
const MAX_DIRECTORIES = 2_000;

/**
 * Git checkouts below `root`, nearest first, for a project that is a folder of clones rather
 * than a repository. Hidden folders and `node_modules` are skipped, and checkouts are not
 * searched further.
 */
export const findNestedCheckouts = Effect.fn("findNestedCheckouts")(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
) {
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
