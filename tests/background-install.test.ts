import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => {
  const handlers: { installed?: (reason: string) => void } = {};
  return {
    handlers,
    onInstalled: vi.fn((h: (r: string) => void) => { handlers.installed = h; }),
    openOptionsPage: vi.fn(async () => undefined),
    onMessage: vi.fn(), onCommand: vi.fn(), getPageUrl: vi.fn(), injectFile: vi.fn(), openPaletteInPage: vi.fn(),
    runInPage: vi.fn(), runTool: vi.fn(), setBadge: vi.fn(), setTitle: vi.fn(), showToast: vi.fn(),
  };
});
vi.mock("../src/extension/api.ts", () => api);
vi.mock("../src/extension/settings.ts", () => ({ loadSettings: vi.fn() }));
const sites = vi.hoisted(() => ({ refreshAutoScripts: vi.fn(async () => 0) }));
vi.mock("../src/extension/siteActions.ts", () => sites);

describe("background first run", () => {
  beforeEach(() => api.openOptionsPage.mockClear());

  it("opens the settings page on install, and not on update", async () => {
    await import("../src/extension/background.ts");
    api.handlers.installed!("update");
    api.handlers.installed!("chrome_update");
    expect(api.openOptionsPage).not.toHaveBeenCalled();
    api.handlers.installed!("install");
    expect(api.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it("an update re-registers the auto files of kept sites (so scene.js reaches sites kept by an older version)", async () => {
    await import("../src/extension/background.ts");
    sites.refreshAutoScripts.mockClear();
    api.handlers.installed!("install");
    expect(sites.refreshAutoScripts).not.toHaveBeenCalled();
    api.handlers.installed!("update");
    expect(sites.refreshAutoScripts).toHaveBeenCalledTimes(1);
  });
});
