// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import {
  CANCEL_PICK_CHANNEL,
  ELEMENT_PICKED_CHANNEL,
  START_PICK_CHANNEL,
} from "./GuestProtocol.ts";

const ipc = vi.hoisted(() => ({
  listeners: new Map<string, (...args: unknown[]) => void>(),
  send: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcRenderer: {
    on: (channel: string, listener: (...args: unknown[]) => void) =>
      ipc.listeners.set(channel, listener),
    off: () => {},
    send: ipc.send,
  },
}));
vi.mock("react-grab/primitives", () => ({ getElementContext: vi.fn() }));

let annotationRoot: ShadowRoot;
const pageListeners: Array<() => void> = [];

beforeAll(async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const attachShadow = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, init) {
    annotationRoot = attachShadow.call(this, init);
    return annotationRoot;
  });
  await import("./PickPreload.ts");
});

afterEach(() => {
  ipc.listeners.get(CANCEL_PICK_CHANNEL)?.({});
  for (const remove of pageListeners.splice(0)) remove();
  ipc.send.mockClear();
});

// Mimics a page that traps keys or the clipboard in the capture phase.
function pageTraps(type: string) {
  const listener = vi.fn((event: Event) => event.preventDefault());
  window.addEventListener(type, listener, true);
  pageListeners.push(() => window.removeEventListener(type, listener, true));
  return listener;
}

function startAnnotation() {
  ipc.listeners.get(START_PICK_CHANNEL)?.({}, undefined, true);
  const comment = annotationRoot.querySelector("textarea");
  if (!comment) throw new Error("Missing annotation comment field");
  comment.focus();
  return comment;
}

const editingEvent = (type: string, init: KeyboardEventInit = {}) =>
  type.startsWith("key")
    ? new KeyboardEvent(type, {
        key: "a",
        ...init,
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    : new Event(type, { bubbles: true, composed: true, cancelable: true });

describe("annotation fields on a page that traps editing events", () => {
  it.each(["keydown", "keypress", "copy", "cut", "paste", "beforeinput"])(
    "keeps native %s working in the comment",
    (type) => {
      const page = pageTraps(type);
      const event = editingEvent(type);
      startAnnotation().dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(page).not.toHaveBeenCalled();
    },
  );

  it("still closes the annotation on Escape from the comment", () => {
    startAnnotation().dispatchEvent(editingEvent("keydown", { key: "Escape" }));
    expect(ipc.send).toHaveBeenCalledWith(ELEMENT_PICKED_CHANNEL, null);
  });

  it("still submits the comment on Enter", () => {
    const event = editingEvent("keydown", { key: "Enter" });
    startAnnotation().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves the page's own fields alone", () => {
    const page = pageTraps("paste");
    startAnnotation();
    const input = document.body.appendChild(document.createElement("textarea"));
    const event = editingEvent("paste");
    input.dispatchEvent(event);
    input.remove();
    expect(event.defaultPrevented).toBe(true);
    expect(page).toHaveBeenCalledOnce();
  });
});
