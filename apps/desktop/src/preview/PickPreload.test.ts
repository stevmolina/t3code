// @vitest-environment jsdom

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

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
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      ipc.listeners.set(channel, listener);
    },
    off: (channel: string) => ipc.listeners.delete(channel),
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
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, options) {
    annotationRoot = attachShadow.call(this, options);
    return annotationRoot;
  });
  await import("./PickPreload.ts");
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  ipc.send.mockClear();
});

afterEach(() => {
  ipc.listeners.get(CANCEL_PICK_CHANNEL)?.({});
  for (const remove of pageListeners.splice(0)) remove();
});

function pageIntercepts(type: string, capture: boolean) {
  const listener = vi.fn((event: Event) => event.preventDefault());
  window.addEventListener(type, listener, capture);
  pageListeners.push(() => window.removeEventListener(type, listener, capture));
  return listener;
}

function startAnnotation() {
  ipc.listeners.get(START_PICK_CHANNEL)?.({}, undefined, true);
  const comment = annotationRoot.querySelector("textarea");
  if (!comment) throw new Error("Missing annotation comment field");
  comment.value = "Change this heading";
  comment.focus();
  return comment;
}

describe("annotation editing inside an inspected page", () => {
  it.each(["c", "v", "x"])(
    "keeps Cmd+%s available when the page intercepts keyboard shortcuts",
    (key) => {
      const pageKeyDown = pageIntercepts("keydown", true);
      const comment = startAnnotation();
      const event = new KeyboardEvent("keydown", {
        key,
        metaKey: true,
        bubbles: true,
        composed: true,
        cancelable: true,
      });

      comment.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(pageKeyDown).not.toHaveBeenCalled();
    },
  );

  it.each(["copy", "cut", "paste", "beforeinput"])(
    "keeps native %s available when the page intercepts clipboard events",
    (type) => {
      const pageClipboard = pageIntercepts(type, true);
      const comment = startAnnotation();
      const event = new Event(type, { bubbles: true, composed: true, cancelable: true });

      comment.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(pageClipboard).not.toHaveBeenCalled();
    },
  );

  it("leaves line breaks and IME confirmation available in the comment", () => {
    const pageKeyDown = pageIntercepts("keydown", true);
    const comment = startAnnotation();
    for (const modifiers of [{ shiftKey: true }, { isComposing: true }]) {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        ...modifiers,
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      comment.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(pageKeyDown).not.toHaveBeenCalled();
  });

  it("stops intercepting the page's editing after cancelling annotations", () => {
    startAnnotation();
    ipc.listeners.get(CANCEL_PICK_CHANNEL)?.({});
    const pagePaste = pageIntercepts("paste", true);
    const event = new Event("paste", { bubbles: true, composed: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(pagePaste).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it.each([
    { metaKey: false, ctrlKey: false, submission: "attach" },
    { metaKey: true, ctrlKey: false, submission: "send" },
    { metaKey: false, ctrlKey: true, submission: "send" },
  ])("submits the comment and selected region as $submission", async (modifiers) => {
    const comment = startAnnotation();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
    document.body.dispatchEvent(
      new MouseEvent("pointerdown", { button: 0, clientX: 10, clientY: 20, bubbles: true }),
    );
    document.body.dispatchEvent(
      new MouseEvent("pointerup", { button: 0, clientX: 110, clientY: 120, bubbles: true }),
    );
    comment.focus();
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      ...modifiers,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    comment.dispatchEvent(event);
    // A region needs no asynchronous element-context lookup.
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(ipc.send).toHaveBeenCalledWith(
      ELEMENT_PICKED_CHANNEL,
      expect.objectContaining({
        comment: "Change this heading",
        regions: [expect.objectContaining({ rect: { x: 10, y: 20, width: 100, height: 100 } })],
      }),
      expect.any(Object),
      modifiers.submission,
      expect.any(Number),
    );
  });

  it("still grows the comment field after an edit", () => {
    const comment = startAnnotation();
    Object.defineProperty(comment, "scrollHeight", { value: 80 });
    comment.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    expect(comment.style.height).toBe("80px");
  });

  it("keeps the inspected page's own clipboard behavior outside the annotation", () => {
    const pagePaste = pageIntercepts("paste", true);
    startAnnotation();
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    try {
      const event = new Event("paste", { bubbles: true, composed: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(pagePaste).toHaveBeenCalledOnce();
    } finally {
      input.remove();
    }
  });
});
