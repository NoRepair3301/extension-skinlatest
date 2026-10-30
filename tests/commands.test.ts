import { describe, expect, it } from "vitest";
import { MSG, TOAST } from "../src/ai/messages.ts";
import { COMMANDS, handleCommand, isCommand, type CommandDeps, type CommandName } from "../src/extension/commands.ts";
import { defaultSettings } from "../src/extension/settings.ts";
import { shortcutLine, shortcutsPage } from "../src/extension/shortcuts.ts";

interface Opts {
  applyResult?: unknown;
  blurState?: unknown;
  failInject?: boolean;
  blocklist?: string[];
  pageUrl?: string | undefined;
  failToast?: boolean;
}

function make(o: Opts = {}) {
  const calls: string[] = [];
  const d: CommandDeps = {
    loadSettings: async () => ({ ...defaultSettings(), blocklist: o.blocklist ?? ["blocked.test"] }),
    inject: async (_t, f) => {
      calls.push(`inject:${f}`);
      if (o.failInject) throw new Error("x");
    },
    runApplier: async (_t, m, a) => {
      calls.push(`run:${m}${typeof a === "string" ? `:${a}` : ""}`);
      return m === "applyTheme" ? (o.applyResult ?? { ok: true }) : undefined;
    },
    openPalette: async () => void calls.push("palette"),
    runTool: async (_t, m) => {
      calls.push(`tool:${m}`);
      return "blurState" in o ? o.blurState : { page: true };
    },
    toast: async (_t, text) => {
      calls.push(`toast:${text}`);
      if (o.failToast) throw new Error("no toaster");
    },
    pageUrl: async () => {
      calls.push("pageUrl");
      return o.pageUrl;
    },
    setBadge: async (_t, text) => void calls.push(`badge:${text}`),
    setTitle: async (_t, text) => void calls.push(`title:${text}`),
  };
  return { d, calls };
}
const tab = (url: string | undefined) => ({ id: 3, url });
const OK = "https://ok.test/";

describe("commands", () => {
  it("knows the four commands", () => {
    expect([...COMMANDS]).toEqual(["transform-page", "restore-page", "open-palette", "toggle-blur-page"]);
    expect(isCommand("toggle-blur-page")).toBe(true);
    expect(isCommand("nope")).toBe(false);
  });

  it("transform-page injects the applier, applies the saved built-in theme, shows the badge and a theme-applied toast", async () => {
    const { d, calls } = make();
    await handleCommand(d, "transform-page", tab(OK));
    expect(calls).toEqual(["title:Skinly AI", "inject:applier.js", "run:applyTheme:calm-light", "badge:ON", "run:syncPet", `toast:${TOAST.themeApplied}`]);
    expect(TOAST.themeApplied).toBe("Skinly: theme applied");
  });

  it("restore-page restores, clears the badge and toasts 'restored'", async () => {
    const { d, calls } = make();
    await handleCommand(d, "restore-page", tab(OK));
    expect(calls).toEqual(["inject:applier.js", "run:restore", "badge:", "title:Skinly AI", `toast:${TOAST.restored}`]);
    expect(TOAST.restored).toBe("Skinly: restored");
  });

  it("open-palette injects the palette, opens it and toasts", async () => {
    const { d, calls } = make();
    await handleCommand(d, "open-palette", tab(OK));
    expect(calls).toEqual(["title:Skinly AI", "inject:palette.js", "palette", `toast:${TOAST.paletteOpen}`]);
  });

  it("toggle-blur-page toggles the whole-page blur and toasts 'blur on' or 'blur off'", async () => {
    const on = make({ blurState: { page: true } });
    await handleCommand(on.d, "toggle-blur-page", tab(OK));
    expect(on.calls).toEqual(["title:Skinly AI", "inject:applier.js", "tool:blurPage", "toast:Skinly: blur on"]);
    const off = make({ blurState: { page: false } });
    await handleCommand(off.d, "toggle-blur-page", tab(OK));
    expect(off.calls.at(-1)).toBe("toast:Skinly: blur off");
  });

  it("toggle-blur-page tells the user when the page script did not answer", async () => {
    const { d, calls } = make({ blurState: undefined });
    await handleCommand(d, "toggle-blur-page", tab(OK));
    expect(calls).toContain(`toast:${TOAST.failed}`);
    expect(calls.some((c) => c.startsWith("title:Skinly couldn't run"))).toBe(true);
  });

  it("blocked pages (internal, store, PDF, user blocklist) get badge and title, are never injected into, and never reach the page", async () => {
    for (const url of ["chrome://extensions", "https://blocked.test/x", "about:blank", "https://chromewebstore.google.com/x", "https://ok.test/a.pdf"]) {
      for (const cmd of ["transform-page", "open-palette", "toggle-blur-page"] as CommandName[]) {
        const { d, calls } = make();
        await handleCommand(d, cmd, tab(url));
        expect(calls, `${cmd} ${url}`).toEqual(["badge:!", `title:${MSG.blocked}`]);
      }
    }
    expect(TOAST.blocked).toBe("Skinly: blocked page");
  });

  it("restore on a blocked page still removes anything we added, without injecting or toasting", async () => {
    const { d, calls } = make();
    await handleCommand(d, "restore-page", tab("https://blocked.test/"));
    expect(calls).toEqual(["run:restore", "badge:", "title:Skinly AI"]);
  });

  it("erp.iitkgp.ac.in is no longer blocked by default", async () => {
    const { d, calls } = make();
    await handleCommand(d, "transform-page", tab("https://erp.iitkgp.ac.in/IIT_ERP3/"));
    expect(calls).toContain("run:applyTheme:calm-light");
  });

  it("when the browser passes no URL, the page is asked and the gate still runs", async () => {
    const ok = make({ pageUrl: OK });
    await handleCommand(ok.d, "transform-page", tab(undefined));
    expect(ok.calls[0]).toBe("pageUrl");
    expect(ok.calls).toContain("run:applyTheme:calm-light");

    const blocked = make({ pageUrl: "https://blocked.test/" });
    await handleCommand(blocked.d, "transform-page", tab(undefined));
    expect(blocked.calls).toEqual(["pageUrl", "badge:!", `title:${MSG.blocked}`]);

    const unknown = make({ pageUrl: undefined });
    await handleCommand(unknown.d, "transform-page", tab(undefined));
    expect(unknown.calls).toEqual(["pageUrl", "badge:!", `title:${MSG.blocked}`]);
  });

  it("a rolled-back theme says why in plain words and toasts a failure", async () => {
    const { d, calls } = make({ applyResult: { ok: false, reason: "invariants", detail: ["a[href] changed"] } });
    await handleCommand(d, "transform-page", tab(OK));
    const title = calls.find((c) => c.startsWith("title:") && c !== "title:Skinly AI")!;
    expect(title).toContain("links or form controls");
    expect(title).not.toContain("a[href]");
    expect(calls).toContain("badge:!");
    expect(calls).toContain(`toast:${TOAST.failed}`);
  });

  it("a failure leaves the page alone and says so", async () => {
    const { d, calls } = make({ failInject: true });
    await handleCommand(d, "transform-page", tab(OK));
    expect(calls).not.toContain("run:applyTheme:calm-light");
    expect(calls).toContain("badge:!");
    expect(calls).toContain(`title:${MSG.commandFailed}`);
  });

  it("a missing toaster never breaks the command", async () => {
    const { d, calls } = make({ failToast: true });
    await handleCommand(d, "transform-page", tab(OK));
    expect(calls).toContain("badge:ON");
  });

  it("ignores a missing tab", async () => {
    const { d, calls } = make();
    await handleCommand(d, "transform-page", undefined);
    expect(calls).toEqual([]);
  });
});

describe("shortcut lines", () => {
  const cmd = { name: "toggle-blur-page", description: "Blur or unblur the whole page", shortcut: "Alt+Shift+B" };
  it("shows the real key, or how to set one, with the browser's own page", () => {
    expect(shortcutLine(cmd, "edge://extensions/shortcuts")).toBe("Blur or unblur the whole page: Alt+Shift+B");
    expect(shortcutLine({ ...cmd, shortcut: "" }, "edge://extensions/shortcuts")).toBe("Blur or unblur the whole page: Not set - open edge://extensions/shortcuts");
  });
  it("picks the page for the browser family", () => {
    expect(shortcutsPage("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130 Safari/537.36 Edg/130.0.0.0", false)).toBe("edge://extensions/shortcuts");
    expect(shortcutsPage("Mozilla/5.0 Chrome/130 Safari/537.36", false)).toBe("chrome://extensions/shortcuts");
    expect(shortcutsPage("Mozilla/5.0 Chrome/130 Safari/537.36", true)).toBe("brave://extensions/shortcuts");
  });
});
