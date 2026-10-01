/**
 * Scripts that run inside a visualization page.
 *
 * The bridge runs before the fragment. It waits for the host's
 * `codex-visualization-initialize` message, keeps the transferred port to
 * itself, and exposes `window.openai`: theme, widget state, follow-up messages,
 * and external links. Fragment code never sees the port, so it cannot forge
 * host requests without going through the user-activation checks here.
 *
 * The helpers run after the fragment: tab lists, `data-tooltip`, and Lucide
 * icon placeholders.
 */
export const VISUALIZATION_BRIDGE_SCRIPT = String.raw`
(() => {
  const root = document.documentElement;
  const hostWindow = window.parent;
  const apply = Reflect.apply;
  const stringify = JSON.stringify;
  const parse = JSON.parse;
  const encoder = new TextEncoder();
  const readData = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data").get;
  const readPorts = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "ports").get;
  const readSource = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "source").get;
  const portPost = MessagePort.prototype.postMessage;
  const portListen = MessagePort.prototype.addEventListener;
  const portStart = MessagePort.prototype.start;
  const stopPropagation = Event.prototype.stopImmediatePropagation;
  const MAX_STATE_BYTES = 16 * 1024;
  const VARIABLE_NAME = /^--[a-z0-9-]{1,64}$/;

  let port = null;
  let state = null;
  let persistence = "none";
  let theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  let nextWriteId = 0;
  const pendingWrites = new Map();

  const post = (type, payload) => {
    if (port !== null) apply(portPost, port, [{ type, ...payload }]);
  };
  const userIsActive = () => navigator.userActivation?.isActive === true;
  const persistenceError = () =>
    Object.assign(new Error("The host could not persist the widget state update"), {
      code: -32000,
      data: { code: "widget_state_persistence_failed", retryable: false },
    });

  const publish = (globals) => {
    window.dispatchEvent(new CustomEvent("openai:set_globals", { detail: { globals } }));
  };
  const applyTheme = (nextTheme, variables) => {
    if (nextTheme === "light" || nextTheme === "dark") theme = nextTheme;
    root.dataset.theme = theme;
    if (variables !== null && typeof variables === "object") {
      for (const [name, value] of Object.entries(variables)) {
        if (VARIABLE_NAME.test(name) && typeof value === "string" && value.length < 512) {
          root.style.setProperty(name, value);
        }
      }
    }
  };

  const setWidgetState = async (next) => {
    const candidate = typeof next === "function" ? next(state) : next;
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new TypeError("Widget state must be a JSON object");
    }
    const serialized = stringify({ modelContent: null, privateContent: null, ...parse(stringify(candidate)) });
    if (encoder.encode(serialized).length > MAX_STATE_BYTES) {
      throw new TypeError("Widget state must be a JSON object of at most 16 KiB");
    }
    state = parse(serialized);
    window.openai.widgetState = state;
    publish({ widgetState: state });
    if (persistence === "none") throw persistenceError();
    const id = ++nextWriteId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingWrites.delete(id);
        reject(persistenceError());
      }, 30000);
      pendingWrites.set(id, { resolve, reject, timeout, serialized });
      post("widget-state-write", { id, state: serialized });
    });
  };
  const sendFollowUpMessage = ({ prompt, title, context } = {}) => {
    if (typeof prompt === "string" && userIsActive()) {
      post("follow-up", { prompt, title, context });
    }
    return Promise.resolve();
  };
  const openExternal = ({ href } = {}) => {
    if (typeof href === "string" && userIsActive()) post("open-external", { href });
  };

  const publishGlobals = () => {
    window.openai = {
      ...window.openai,
      theme,
      visualizationTheme: theme,
      widgetState: state,
      statePersistence: persistence,
      stateModelContext: "none",
      setWidgetState,
      sendFollowUpMessage,
      openExternal,
    };
    publish(window.openai);
  };

  const measure = () => {
    const body = document.body;
    if (body === null) return;
    post("height", {
      height: Math.ceil(Math.max(body.scrollHeight, body.getBoundingClientRect().height)),
    });
  };

  const onHostMessage = (event) => {
    const data = apply(readData, event, []);
    if (data === null || typeof data !== "object") return;
    if (data.type === "measure") {
      measure();
    } else if (data.type === "theme") {
      applyTheme(data.theme, data.variables);
      publishGlobals();
    } else if (data.type === "widget-state-result" && typeof data.id === "number") {
      const pending = pendingWrites.get(data.id);
      if (pending === undefined) return;
      pendingWrites.delete(data.id);
      clearTimeout(pending.timeout);
      if (data.ok === true) pending.resolve();
      else pending.reject(persistenceError());
    }
  };

  window.addEventListener(
    "message",
    (event) => {
      const data = apply(readData, event, []);
      const ports = apply(readPorts, event, []);
      if (
        port !== null ||
        apply(readSource, event, []) !== hostWindow ||
        data === null ||
        typeof data !== "object" ||
        data.type !== "codex-visualization-initialize" ||
        ports.length !== 1
      ) {
        return;
      }
      apply(stopPropagation, event, []);
      const nextPort = ports[0];
      apply(portListen, nextPort, ["message", onHostMessage]);
      apply(portStart, nextPort, []);
      port = nextPort;
      const globals = data.globals ?? {};
      if (globals.widgetState !== null && typeof globals.widgetState === "object") {
        state = globals.widgetState;
      }
      persistence = globals.statePersistence === "local" ? "local" : "none";
      applyTheme(globals.theme, globals.variables);
      publishGlobals();
      for (const [id, pending] of pendingWrites) post("widget-state-write", { id, state: pending.serialized });
      measure();
    },
    { capture: true },
  );

  // Links leave the frame through the host; in-page anchors scroll the chat.
  window.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const link = target?.closest("a[href]");
    const href = link?.getAttribute("href");
    if (href == null) return;
    event.preventDefault();
    if (href.startsWith("#")) {
      let id = "";
      try {
        id = decodeURIComponent(href.slice(1));
      } catch {
        return;
      }
      const element = id.length === 0 ? root : document.getElementById(id);
      if (element !== null && userIsActive()) {
        post("scroll-to", { top: element.getBoundingClientRect().top + window.scrollY });
      }
      return;
    }
    openExternal({ href: new URL(href, document.baseURI).href });
  });

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    if (port === null) {
      applyTheme(event.matches ? "dark" : "light", null);
      publishGlobals();
    }
  });
  applyTheme(theme, null);
  publishGlobals();
  addEventListener("DOMContentLoaded", () => new ResizeObserver(measure).observe(document.body));
  addEventListener("load", measure);
  document.currentScript?.remove();
})();
`;

export const VISUALIZATION_HELPERS_SCRIPT = String.raw`
(() => {
  const TAB = '.nav[role="tablist"] [role="tab"]';
  const DISABLED = ':disabled,[aria-disabled="true"]';
  const selectTab = (selected) => {
    const list = selected.closest('[role="tablist"]');
    for (const tab of list.querySelectorAll('[role="tab"]')) {
      const active = tab === selected;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      const panelId = tab.getAttribute("aria-controls");
      const panel = panelId ? document.getElementById(panelId) : null;
      if (panel !== null) panel.hidden = panelId !== selected.getAttribute("aria-controls");
    }
  };
  for (const list of document.querySelectorAll('.nav[role="tablist"]')) {
    const initial =
      list.querySelector('[role="tab"][aria-selected="true"]') ??
      list.querySelector('[role="tab"].active') ??
      list.querySelector('[role="tab"]');
    if (initial !== null) selectTab(initial);
  }
  document.addEventListener("click", (event) => {
    const tab = event.target instanceof Element ? event.target.closest(TAB) : null;
    if (tab !== null && !event.defaultPrevented && !tab.matches(DISABLED)) selectTab(tab);
  });
  document.addEventListener("keydown", (event) => {
    const tab = event.target instanceof Element ? event.target.closest(TAB) : null;
    if (tab === null || event.defaultPrevented) return;
    const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')].filter(
      (candidate) => !candidate.matches(DISABLED),
    );
    const index = tabs.indexOf(tab);
    const moves = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1 + tabs.length,
      ArrowUp: index - 1 + tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!(event.key in moves) || tabs.length === 0) return;
    event.preventDefault();
    const next = tabs[moves[event.key] % tabs.length];
    next.focus();
    selectTab(next);
  });

  let tooltip = null;
  let tooltipTrigger = null;
  const hideTooltip = () => {
    tooltip?.remove();
    tooltipTrigger?.removeAttribute("aria-describedby");
    tooltipTrigger = null;
  };
  const showTooltip = (trigger) => {
    const text = trigger.getAttribute("data-tooltip")?.trim();
    if (!text || tooltipTrigger === trigger) return;
    hideTooltip();
    tooltip ??= Object.assign(document.createElement("div"), {
      className: "tooltip",
      id: "visualization-tooltip",
    });
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = text;
    tooltip.style.visibility = "hidden";
    document.body.appendChild(tooltip);
    tooltipTrigger = trigger;
    trigger.setAttribute("aria-describedby", tooltip.id);
    const anchor = trigger.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const gap = 6;
    const placement = trigger.getAttribute("data-tooltip-placement") ?? "top";
    let x = anchor.left + anchor.width / 2 - box.width / 2;
    let y = anchor.top - box.height - gap;
    if (placement === "bottom" || (placement === "top" && y < gap)) y = anchor.bottom + gap;
    if (placement === "right") [x, y] = [anchor.right + gap, anchor.top + anchor.height / 2 - box.height / 2];
    if (placement === "left") [x, y] = [anchor.left - box.width - gap, anchor.top + anchor.height / 2 - box.height / 2];
    x = Math.min(Math.max(gap, x), innerWidth - box.width - gap);
    y = Math.max(gap, y);
    tooltip.style.transform = "translate(" + Math.round(x) + "px, " + Math.round(y) + "px)";
    tooltip.style.visibility = "visible";
  };
  const triggerOf = (event) =>
    event.target instanceof Element ? event.target.closest("[data-tooltip]") : null;
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch") return;
    const trigger = triggerOf(event);
    if (trigger !== null) showTooltip(trigger);
  });
  document.addEventListener("pointerout", (event) => {
    const trigger = triggerOf(event);
    if (trigger !== null && !trigger.contains(event.relatedTarget)) hideTooltip();
  });
  document.addEventListener("focusin", (event) => {
    const trigger = triggerOf(event);
    if (trigger?.matches(":focus-visible")) showTooltip(trigger);
  });
  document.addEventListener("focusout", hideTooltip);
  document.addEventListener("keydown", (event) => event.key === "Escape" && hideTooltip());
  document.addEventListener("click", (event) => {
    const trigger = triggerOf(event);
    if (trigger === null) hideTooltip();
    else if (event.pointerType === "touch") tooltipTrigger === trigger ? hideTooltip() : showTooltip(trigger);
  });

  const drawIcons = () => window.lucide?.createIcons({ attrs: { width: 16, height: 16 } });
  if (window.lucide) drawIcons();
  else document.getElementById("visualization-lucide")?.addEventListener("load", drawIcons, { once: true });
})();
`;
