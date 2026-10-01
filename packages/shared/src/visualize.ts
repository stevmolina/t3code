/**
 * The Visualize content reference an agent writes on its own line to show an
 * HTML fragment inline:
 *
 *   U+E200 "visualize" U+E202 {"path":"/abs/file.html","mode":"wide","title":"…"} U+E201
 *
 * Codex's Visualize plugin emits the same reference, so the parser accepts its
 * output unchanged.
 */

import type { ServerProviderSkill } from "@t3tools/contracts";

export const VISUALIZE_SKILL_NAME = "visualize";

/**
 * T3 Code's own Visualize skill, offered to providers that do not ship one.
 * The server inlines its instructions when a turn invokes `$visualize`.
 */
export const BUILTIN_VISUALIZE_SKILL = {
  name: VISUALIZE_SKILL_NAME,
  displayName: "Visualize",
  shortDescription: "Create interactive visuals",
  description:
    "Create charts, diagrams, simulations, and interface previews that render live in the conversation.",
  path: "t3code:builtin/visualize",
  scope: "app",
  enabled: true,
} satisfies ServerProviderSkill;

/** Whether a provider already lists its own Visualize skill. */
export function hasProviderVisualizeSkill(skills: ReadonlyArray<ServerProviderSkill>): boolean {
  return skills.some((skill) => skill.name.trim().toLowerCase() === VISUALIZE_SKILL_NAME);
}

/** Adds the built-in skill unless the provider ships its own. */
export function withBuiltinVisualizeSkill(
  skills: ReadonlyArray<ServerProviderSkill>,
): ReadonlyArray<ServerProviderSkill> {
  return hasProviderVisualizeSkill(skills) ? skills : [...skills, BUILTIN_VISUALIZE_SKILL];
}

const CITATION_START = "\uE200";
const CITATION_SEPARATOR = "\uE202";
const CITATION_END = "\uE201";
const CITATION_PREFIX = `${CITATION_START}${VISUALIZE_SKILL_NAME}${CITATION_SEPARATOR}`;

/** Fence language that carries a citation from the Markdown parser to the renderer. */
export const VISUALIZE_CITATION_FENCE_LANGUAGE = "t3-visualize";

const MAX_CITATION_LENGTH = 4096;
const MAX_TITLE_LENGTH = 200;

export interface VisualizeCitation {
  readonly path: string;
  readonly mode: "normal" | "wide";
  readonly title?: string;
}

function isAbsoluteHostPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

/** Parses one trimmed line. Anything but a well-formed reference returns null. */
export function parseVisualizeCitation(line: string): VisualizeCitation | null {
  const trimmed = line.trim();
  if (
    trimmed.length > MAX_CITATION_LENGTH ||
    !trimmed.startsWith(CITATION_PREFIX) ||
    !trimmed.endsWith(CITATION_END)
  ) {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed.slice(CITATION_PREFIX.length, -CITATION_END.length));
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { path, mode, title } = payload as Record<string, unknown>;
  if (typeof path !== "string" || path.includes("\0") || !isAbsoluteHostPath(path)) return null;
  if (!/\.html?$/i.test(path)) return null;
  if (mode !== undefined && mode !== "wide") return null;
  const trimmedTitle = typeof title === "string" ? title.trim().slice(0, MAX_TITLE_LENGTH) : "";
  return {
    path,
    mode: mode === "wide" ? "wide" : "normal",
    ...(trimmedTitle.length > 0 ? { title: trimmedTitle } : {}),
  };
}

const FENCE_PATTERN = /^( {0,3})(`{3,}|~{3,})/;

/**
 * Wraps each reference line in a fence so Markdown keeps its JSON verbatim and
 * the code block renderer can swap it for the visual. References inside
 * existing fences stay as written.
 */
export function fenceVisualizeCitations(markdown: string): string {
  if (!markdown.includes(CITATION_PREFIX)) return markdown;
  const lines = markdown.split("\n");
  let openFence: string | null = null;
  let changed = false;
  const output: string[] = [];
  for (const line of lines) {
    const fence = FENCE_PATTERN.exec(line);
    if (openFence !== null) {
      if (fence && fence[2]![0] === openFence[0] && fence[2]!.length >= openFence.length) {
        openFence = null;
      }
      output.push(line);
      continue;
    }
    if (fence) {
      openFence = fence[2]!;
      output.push(line);
      continue;
    }
    const indent = /^ {0,3}/.exec(line)![0];
    // Four spaces or a tab already make an indented code block.
    if (!/^(?: {4}|\t)/.test(line) && parseVisualizeCitation(line) !== null) {
      output.push(
        "",
        `${indent}\`\`\`${VISUALIZE_CITATION_FENCE_LANGUAGE}`,
        `${indent}${line.trim()}`,
        `${indent}\`\`\``,
        "",
      );
      changed = true;
      continue;
    }
    output.push(line);
  }
  return changed ? output.join("\n") : markdown;
}
