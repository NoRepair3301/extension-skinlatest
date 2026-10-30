import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => {
  const handlers: { installed?: (reason: string) => void; startup?: () => void } = {};
  return {
    handlers,
    onInstalled: vi.fn((h: (r: string) => void) => { handlers.installed = h; }),
    onStartup: vi.fn((h: () => void) => { handlers.startup = h; }),
    openOptionsPage: vi.fn(async () => undefined),
    onMessage: vi.fn(), onCommand: vi.fn(), getPageUrl: vi.fn(), injectFile: vi.fn(), openPaletteInPage: vi.fn(),
    runInPage: vi.fn(), runTool: vi.fn(), setBadge: vi.fn(), setTitle: vi.fn(), showToast: vi.fn(),
    onOriginsAdded: vi.fn(), onOriginsRemoved: vi.fn(), onStorageChanged: vi.fn(), unregisterAutoScript: vi.fn(),
  };
});
vi.mock("../src/extension/api.ts", () => api);
vi.mock("../src/extension/settings.ts", () => ({ loadSettings: vi.fn() }));
const sites = vi.hoisted(() => ({ reconcile: vi.fn(async () => ({ registered: 0, removed: 0 })), scriptId: (o: string) => `skinly-${o}` }));
vi.mock("../src/extension/siteActions.ts", () => sites);
const keeper = vi.hoisted(() => ({ completeIntent: vi.fn(async () => "none"), originsOfPatterns: vi.fn(() => []), serial: <T>(job: () => Promise<T>) => job() }));
vi.mock("../src/extension/keeper.ts", () => keeper);

const flush = () => new Promise((r) => setTimeout(r, 0));

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

  it("reconciles registrations on worker start, browser start, install and update, not on a browser update", async () => {
    await import("../src/extension/background.ts");
    await flush();
    sites.reconcile.mockClear();
    api.handlers.installed!("chrome_update");
    await flush();
    expect(sites.reconcile).not.toHaveBeenCalled();
    api.handlers.installed!("install");
    api.handlers.installed!("update");
    api.handlers.startup!();
    await flush();
    expect(sites.reconcile).toHaveBeenCalledTimes(3);
    expect(keeper.completeIntent).toHaveBeenCalledWith("start");
  });
});
