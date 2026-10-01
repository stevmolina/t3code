/**
 * Base stylesheet for inline visualization pages. Defaults follow the system
 * color scheme; the host replaces the theme variables with the app's own values
 * once the bridge connects. Class names follow the vocabulary visualization
 * fragments are written against (cards, buttons, form controls, tables).
 */
export const VISUALIZATION_STYLES = String.raw`
:root {
  color-scheme: light dark;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --font-size-base: 14px;
  --radius: 10px;
  --background: light-dark(#fcfcfd, #0a0a0a);
  --foreground: light-dark(#27272a, #f5f5f5);
  --card: light-dark(#ffffff, #141414);
  --card-foreground: var(--foreground);
  --popover: light-dark(#ffffff, #1a1a1a);
  --popover-foreground: var(--foreground);
  --primary: light-dark(oklch(0.488 0.217 264), oklch(0.571 0.21 264));
  --primary-foreground: #ffffff;
  --secondary: light-dark(#f7f7f8, rgb(255 255 255 / 3%));
  --secondary-foreground: var(--foreground);
  --muted: light-dark(#f4f4f5, rgb(255 255 255 / 4%));
  --muted-foreground: light-dark(#71717a, #9a9a9a);
  --accent: light-dark(#f0f0f2, rgb(255 255 255 / 6%));
  --accent-foreground: var(--foreground);
  --destructive: light-dark(#dc2626, #f87171);
  --border: light-dark(#e4e4e7, rgb(255 255 255 / 9%));
  --input: light-dark(#d4d4d8, rgb(255 255 255 / 14%));
  --ring: var(--primary);
  --blue: light-dark(#2563eb, #60a5fa);
  --orange: light-dark(#ea580c, #fb923c);
  --green: light-dark(#059669, #34d399);
  --red: light-dark(#dc2626, #f87171);
  --purple: light-dark(#7c3aed, #a78bfa);
  --yellow: light-dark(#ca8a04, #facc15);
  --viz-series-1: var(--primary);
  --viz-series-2: var(--orange);
  --viz-series-3: var(--green);
  --viz-series-4: var(--purple);
  --viz-series-5: var(--yellow);
  --viz-series-6: var(--red);
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] { color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; }
body {
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  line-height: 1.5;
  color: var(--foreground);
  overflow-wrap: anywhere;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3 { margin: 0 0 0.5em; font-weight: 500; line-height: 1.3; }
h1 { font-size: 1.43em; }
h2 { font-size: 1.21em; }
h3 { font-size: 1.07em; }
p { margin: 0 0 0.75em; }
a { color: var(--primary); text-underline-offset: 2px; }
hr { border: 0; border-top: 1px solid var(--border); margin: 12px 0; }
code, pre { font-family: var(--font-mono); font-size: 0.9em; }
code { background: var(--muted); border-radius: 4px; padding: 0.1em 0.35em; }
pre { background: var(--muted); border-radius: calc(var(--radius) - 4px); padding: 10px 12px; overflow-x: auto; }
pre code { background: none; padding: 0; }
canvas, svg, img { max-width: 100%; }

.text-small { font-size: 0.857em; }
.text-muted { color: var(--muted-foreground); }
.text-destructive { color: var(--destructive); }
.text-end { text-align: end; }
.text-center { text-align: center; }
.text-nowrap { white-space: nowrap; }
.tabular-nums { font-variant-numeric: tabular-nums; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.cursor-interaction { cursor: pointer; }

.card {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
}
.viz-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
.viz-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.viz-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 10px 14px; margin-bottom: 12px; }
.viz-controls > .form-label { flex: 1 1 calc(50% - 14px); min-width: 180px; }
.viz-stat-value { font-size: 1.43em; font-weight: 500; font-variant-numeric: tabular-nums; }
.viz-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px;
  border-radius: 999px; font-size: 0.857em;
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  color: var(--foreground);
}
.viz-dotted-background {
  background-image: radial-gradient(color-mix(in srgb, var(--foreground) 16%, transparent) 1px, transparent 1px);
  background-size: 14px 14px;
  border-radius: var(--radius);
  padding: 20px;
}

.btn, button.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 30px; padding: 4px 12px;
  font: inherit; font-weight: 500; color: var(--foreground);
  background: var(--secondary);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) - 2px);
  cursor: pointer; text-decoration: none;
}
.btn:hover { background: var(--accent); }
.btn:disabled, .btn[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--foreground); color: var(--background); border-color: transparent; }
.btn-primary:hover { background: color-mix(in srgb, var(--foreground) 88%, var(--background)); }
.btn-ghost { background: transparent; border-color: transparent; }
.btn-block { display: flex; width: 100%; }
.btn[aria-pressed="true"], .btn[aria-selected="true"], .btn.is-selected {
  background: var(--primary); color: var(--primary-foreground); border-color: transparent;
}
.viz-tile { width: 100%; height: 100%; }
.viz-tile[aria-pressed="true"], .viz-tile.is-selected {
  background: var(--secondary); color: var(--foreground);
  box-shadow: 0 0 0 2px var(--ring);
}
@media (pointer: coarse) { .btn { min-height: 44px; } }

.form-label { display: flex; flex-direction: column; gap: 4px; font-size: 0.857em; color: var(--muted-foreground); }
.form-control, .form-select {
  font: inherit; color: var(--foreground); background: var(--background);
  border: 1px solid var(--input); border-radius: calc(var(--radius) - 2px);
  padding: 5px 9px; min-height: 30px; width: 100%;
}
textarea.form-control { min-height: 72px; }
.form-control-color { padding: 2px; width: 44px; }
@media (pointer: coarse) { .form-control, .form-select { font-size: 16px; min-height: 44px; } }
.form-range { width: 100%; accent-color: var(--primary); }
.form-check { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.form-check-input { accent-color: var(--primary); width: 16px; height: 16px; margin: 0; }
.form-switch .form-check-input {
  appearance: none; width: 30px; height: 18px; border-radius: 999px;
  background: var(--input); position: relative; cursor: pointer;
}
.form-switch .form-check-input::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
  border-radius: 50%; background: var(--background); transition: transform 120ms ease;
}
.form-switch .form-check-input:checked { background: var(--primary); }
.form-switch .form-check-input:checked::after { transform: translateX(12px); }

.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 7px 10px; border-bottom: 1px solid var(--border); text-align: start; vertical-align: top; }
.table th { font-weight: 500; color: var(--muted-foreground); }
.table td.text-end, .table th.text-end { font-variant-numeric: tabular-nums; }
.table-sm th, .table-sm td { padding: 4px 8px; }
.table-responsive { overflow-x: auto; }

.nav.nav-pills { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
.nav-pills.nav-justified .nav-link { flex: 1 1 0; }
.nav-pills .nav-link {
  font: inherit; color: var(--muted-foreground); background: transparent;
  border: 0; border-radius: calc(var(--radius) - 2px); padding: 4px 10px; cursor: pointer;
}
.nav-pills .nav-link:hover { color: var(--foreground); }
.nav-pills .nav-link.active { background: var(--secondary); color: var(--foreground); }
.nav-pills .nav-link:disabled, .nav-pills .nav-link[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }

.progress { height: 6px; border-radius: 999px; background: var(--muted); overflow: hidden; }
.progress-bar { height: 100%; background: var(--viz-series-1); }

.tooltip {
  position: fixed; top: 0; left: 0; z-index: 10; pointer-events: none;
  max-width: min(280px, calc(100vw - 16px));
  padding: 4px 8px; border-radius: 6px;
  background: var(--popover); color: var(--popover-foreground);
  border: 1px solid var(--border);
  box-shadow: 0 4px 14px rgb(0 0 0 / 14%);
  font-size: 12px; line-height: 1.4;
}
[data-lucide] { display: inline-block; width: 16px; height: 16px; vertical-align: -3px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;
