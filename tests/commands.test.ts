import { describe, expect, it } from "vitest";
import { MSG, TOAST } from "../src/ai/messages.ts";
import { COMMANDS, handleCommand, isCommand, type CommandDeps, type CommandName } from "../src/extension/commands.ts";
import { defaultSettings } from "../src/extension/settings.ts";
import type { RestoreOutcome } from "../src/extension/restore.ts";
import { shortcutLine, shortcutsPage } from "../src/extension/shortcuts.ts";
import { S } from "../src/ui/strings.ts";

interface Opts {
  applyResult?: unknown;
  petOn?: boolean | undefined;
  blurState?: unknown;
  failInject?: boolean;
  blocklist?: string[];
  pageUrl?: string | undefined;
  failToast?: boolean;
  restoreResult?: RestoreOutcome;
  restoreThrows?: boolean;
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
      if (m === "togglePet") return "petOn" in o ? o.petOn : true;
      return m === "applyTheme" ? (o.applyResult ?? { ok: true }) : undefined;
    },
    restore: async (_t, url, blocklist) => {
      calls.push(`restore:${url ?? "-"}:${blocklist.join(",")}`);
      if (o.restoreThrows) throw new Error("x");
      return o.restoreResult ?? { ok: true, paused: false };
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
  it("knows the five commands", () => {
    expect([...COMMANDS]).toEqual(["transform-page", "restore-page", "open-palette", "toggle-blur-page", "toggle-pet"]);
    expect(isCommand("toggle-pet")).toBe(true);
    expect(isCommand("toggle-blur-page")).toBe(true);
    expect(isCommand("nope")).toBe(false);
  });

  it("transform-page injects the applier, applies the saved built-in theme, shows the badge and a theme-applied toast", async () => {
    const { d, calls } = make();
    await handleCommand(d, "transform-page", tab(OK));
    expect(calls).toEqual(["title:Skinly AI", "inject:applier.js", "run:applyTheme:calm-light", "badge:ON", "run:syncPet", `toast:${TOAST.themeApplied}`]);
    expect(TOAST.themeApplied).toBe("Skinly: theme applied");
  });

  it("F3: transform-page applies the saved theme as it is, whichever of the six it is", async () => {
    for (const theme of ["warm-paper", "ocean", "field"] as const) {
      const t = make();
      t.d.loadSettings = async () => ({ ...defaultSettings(), theme });
      await handleCommand(t.d, "transform-page", tab(OK));
      expect(t.calls).toContain(`run:applyTheme:${theme}`);
    }
  });

  it("restore-page runs the shared restore (same path as the popup button), resets the title and toasts 'restored'", async () => {
    const { d, calls } = make();
    await handleCommand(d, "restore-page", tab(OK));
    // inject, all frames, pause and badge are the shared function's job (tests/restore-path.test.ts); the command adds the title and the toast
    expect(calls).toEqual([`restore:${OK}:blocked.test`, "title:Skinly AI", `toast:${TOAST.restored}`]);
    expect(TOAST.restored).toBe("Skinly: restored");
  });

  it("restore-page asks the page itself for the address when the browser passes none, so the same gate runs", async () => {
    const { d, calls } = make({ pageUrl: OK });
    await handleCommand(d, "restore-page", tab(undefined));
    expect(calls).toEqual(["pageUrl", `restore:${OK}:blocked.test`, "title:Skinly AI", `toast:${TOAST.restored}`]);
  });

  it("restore-page: when nothing could restore the page, the badge and title say so and no 'restored' toast shows", async () => {
    const { d, calls } = make({ restoreResult: { ok: false, reason: "failed" } });
    await handleCommand(d, "restore-page", tab(OK));
    expect(calls).toEqual([`restore:${OK}:blocked.test`, "badge:!", `title:${S.popup.restoreFailed}`, `toast:${TOAST.failed}`]);
    expect(calls).not.toContain(`toast:${TOAST.restored}`);
  });

  it("restore-page: an error in the shared restore fails safe (badge, title, toast)", async () => {
    const { d, calls } = make({ restoreThrows: true });
    await handleCommand(d, "restore-page", tab(OK));
    expect(calls).toContain("badge:!");
    expect(calls).toContain(`title:${MSG.commandFailed}`);
    expect(calls).not.toContain(`toast:${TOAST.restored}`);
  });

  it("open-palette injects the palette, opens it and toasts", async () => {
    const { d, calls } = make();
    await handleCommand(d, "open-palette", tab(OK));
    expect(calls).toEqual(["title:Skinly AI", "inject:palette.js", "palette", `toast:${TOAST.paletteOpen}`]);
  });

  it("toggle-blur-page toggles the whole-page blur and toasts 'blur on' or 'blur off'", async () => {
    const on = make({ blurState: { page: true } });
    await handleCommand(on.d, "toggle-blur-page", tab(OK));
    expect(on.calls).toEqual(["title:Skinly AI", "inject:applier.js", "tool:blurPage", "run:syncPet", "toast:Skinly: blur on"]);
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
    const { d, calls } = make({ restoreResult: { ok: false, reason: "blocked" } });
    await handleCommand(d, "restore-page", tab("https://blocked.test/"));
    expect(calls).toEqual(["restore:https://blocked.test/:blocked.test", "title:Skinly AI"]);
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

describe("toggle-pet", () => {
  it("injects the applier, toggles the pet with the pet settings and shows a two-second toast either way", async () => {
    const on = make();
    await handleCommand(on.d, "toggle-pet", tab(OK));
    expect(on.calls).toEqual(["title:Skinly AI", "inject:applier.js", "run:togglePet", `toast:${TOAST.petOn}`]);
    const off = make({ petOn: false });
    await handleCommand(off.d, "toggle-pet", tab(OK));
    expect(off.calls).toContain(`toast:${TOAST.petOff}`);
  });
  it("says it failed when the page does not answer", async () => {
    const { d, calls } = make({ petOn: undefined });
    await handleCommand(d, "toggle-pet", tab(OK));
    expect(calls).toContain(`toast:${TOAST.failed}`);
  });
  it("does nothing on a blocked page except the badge and the tooltip", async () => {
    const { d, calls } = make();
    await handleCommand(d, "toggle-pet", tab("chrome://settings"));
    expect(calls).toEqual(["badge:!", `title:${MSG.blocked}`]);
  });
});
