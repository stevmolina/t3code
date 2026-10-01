import { VISUALIZE_SKILL_NAME } from "@t3tools/shared/visualize";

/**
 * T3 Code's built-in Visualize skill. Providers that do not ship their own
 * `visualize` skill get these instructions inlined into the turn when the user
 * invokes `$visualize` from the composer. Codex ships one as a plugin, so Codex
 * keeps its native skill and only the renderer is shared.
 */
export function visualizeSkillInstructions(outputDirectory: string): string {
  return `# Visualize

The user asked for an in-conversation visual. T3 Code renders an HTML fragment you write as a live, sandboxed page inside your reply.

## When to draw

- Draw when seeing or exploring something explains it better than prose: how a mechanism moves, what changes when an input changes, a comparison, a chart, a map, a simulation, or a preview of an interface.
- A request for a real file, page, component, or project change is not a visual. Do that work in the project instead.
- A plain table is a Markdown table. A static graph of labeled boxes and arrows is a fenced Mermaid block. Neither needs a fragment.
- Work quietly. Your final reply is the first thing the user reads. Describe what the visual shows or helps decide, in a sentence or two. Do not mention HTML, files, fragments, skills, or how the visual is built.

## Output contract

1. Write one HTML fragment to a new file in \`${outputDirectory}\`, named with a short lowercase-hyphenated title, for example \`${outputDirectory}/tcp-handshake.html\`. Create the directory if it is missing. To update a visual, rewrite its file.
2. The file is a fragment: no \`<!doctype>\`, \`<html>\`, \`<head>\`, or \`<body>\`. Write literal markup with real newlines, not an escaped string. Keep it under 1 MB; aggregate or downsample large data.
3. Put this reference on its own line in your final reply where the visual should appear, using the absolute path:

   \uE200visualize\uE202{"path":"${outputDirectory}/tcp-handshake.html"}\uE201

   Add \`"mode":"wide"\` only for a full desktop app mockup or for several chart panels that must sit side by side to be compared. Add \`"title":"…"\` when a label helps. Emit the reference in the same reply every time you create or update the visual. Never wrap it in a code block, link to it, or call it an attachment.

## Runtime

- The fragment runs in a sandboxed frame with an opaque origin. Scripts run; forms, popups, and network calls do not. Never use \`fetch\`, XHR, or WebSocket.
- Scripts, styles, and fonts may load only from cdnjs.cloudflare.com, cdn.jsdelivr.net, esm.sh, unpkg.com, fonts.googleapis.com, fonts.gstatic.com, and fonts.bunny.net. Pin versions, for example \`https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js\`.
- Give the root element a unique id and find it with \`document.getElementById\`. Check that every identifier is defined and every queried element exists.
- The frame grows to fit the content. Fill the width (about 736px, or 1,024px in wide mode) and reflow down to 320px. Avoid fixed outer widths, internal scrolling, \`position: fixed\`, and viewport-height layouts.

## Look

- The page background is transparent and the app's theme is supplied as CSS variables: \`--background\`, \`--foreground\`, \`--card\`, \`--card-foreground\`, \`--popover\`, \`--popover-foreground\`, \`--primary\`, \`--primary-foreground\`, \`--secondary\`, \`--secondary-foreground\`, \`--muted\`, \`--muted-foreground\`, \`--accent\`, \`--accent-foreground\`, \`--destructive\`, \`--border\`, \`--input\`, \`--ring\`, \`--blue\`, \`--orange\`, \`--green\`, \`--red\`, \`--purple\`, \`--yellow\`, \`--font-sans\`, \`--font-mono\`, and \`--font-size-base\`.
- Use these variables for every color so light and dark themes both work. Never hardcode white panels or black text. Inside SVG, use \`currentColor\` or the variables.
- Chart series use \`--viz-series-1\` for a single measure, and \`--viz-series-2\` to \`--viz-series-6\` only when categories need distinct colors. Keep labels and values in \`--foreground\` or \`--muted-foreground\`, and grids thin and neutral. Resolve variables with \`getComputedStyle\` before passing colors to canvas.
- Use font weights 400 and 500 only, and keep text at least 11px.
- Built-in classes: \`.card\` (the only framed surface; never nest), \`.viz-grid\`, \`.viz-row\`, \`.viz-controls\`, \`.viz-stat\` with \`.viz-stat-value\`, \`.viz-badge\`, \`.btn\` with \`.btn-primary\`, \`.btn-ghost\`, \`.btn-block\`, \`.form-label\`, \`.form-control\`, \`.form-select\`, \`.form-range\`, \`.form-check\` with \`.form-check-input\` and \`.form-switch\`, \`.table\` with \`.table-sm\` and \`.table-responsive\`, \`.nav.nav-pills\` tabs, \`.progress\` with \`.progress-bar\`, \`.text-small\`, \`.text-muted\`, \`.text-destructive\`, \`.tabular-nums\`, \`.sr-only\`, and \`.viz-dotted-background\` for a mockup's surrounding canvas.
- Tabs work without code: \`.nav.nav-pills[role="tablist"]\` holding \`button.nav-link[role="tab"]\` elements with \`aria-controls\` pointing at \`[role="tabpanel"]\` elements; mark inactive panels \`hidden\`.
- \`data-tooltip="…"\` on any element shows a themed tooltip on hover, focus, and tap. \`<i data-lucide="name" aria-hidden="true"></i>\` renders a Lucide icon; call \`lucide.createIcons()\` after adding icons dynamically.
- For product mockups, define the product's own colors and type at the mockup root instead of the classes above, and follow the theme with \`light-dark()\`.

## Composition

- Choose the smallest composition that answers the question: one dominant visual, only the controls the user needs, and no filler cards, summaries, or invented metrics.
- Keep explanations, formulas, and narrative out of the fragment. Labels, legends, values, and accessible text belong in it.
- Charts get labeled axes with units, a concise title, and direct labels when there are few series. Size each SVG from its container and redraw on resize. Animate state changes, never the first paint, and honor \`prefers-reduced-motion\`.
- Use semantic HTML and native controls, keep the native tab order, give icon-only buttons an \`aria-label\`, and use \`aria-live="polite"\` for results that change.

## Host API

- \`window.openai.theme\` is \`"light"\` or \`"dark"\`. Listen for the \`openai:set_globals\` event to react to theme changes.
- \`window.openai.widgetState\` holds state saved earlier for this visual. After a meaningful interaction, save with \`window.openai.setWidgetState({ modelContent, privateContent }).catch(() => {})\`, under 16 KiB. Never save on load.
- \`await window.openai.sendFollowUpMessage({ prompt, title })\` from a clearly labeled button puts a follow-up request in the user's composer, for example to explain a selected data point. Include the selected values in the prompt.
- Links open in the user's browser. In-page \`#anchor\` links scroll the conversation.`;
}

const SKILL_MENTION = new RegExp(
  String.raw`(^|\s)\p{Sc}${VISUALIZE_SKILL_NAME}(?=$|[\s.,;:!?)\]])`,
  "giu",
);

/** True when the prompt invokes the skill with `$visualize`. */
export function mentionsVisualizeSkill(prompt: string): boolean {
  SKILL_MENTION.lastIndex = 0;
  return SKILL_MENTION.test(prompt);
}

/**
 * Replaces `$visualize` with the skill instructions the provider would
 * otherwise never see. The user's own words stay first.
 */
export function expandVisualizeSkill(prompt: string, outputDirectory: string): string {
  const request = prompt
    .replace(SKILL_MENTION, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return [
    request.length > 0 ? request : "Visualize the current topic of this conversation.",
    "",
    `<skill name="${VISUALIZE_SKILL_NAME}">`,
    "The user invoked the Visualize skill for this request. Follow these instructions.",
    "",
    visualizeSkillInstructions(outputDirectory),
    "</skill>",
  ].join("\n");
}
