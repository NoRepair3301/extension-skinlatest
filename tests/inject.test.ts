import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ injectFile: vi.fn(), runInPage: vi.fn(), runScene: vi.fn() }));
vi.mock("../src/extension/api.ts", () => api);
import { ensureApplier, ensureScene } from "../src/extension/inject.ts";

beforeEach(() => void Object.values(api).forEach((f) => f.mockReset()));

describe("repeat injection", () => {
  it("a refused repeat does not matter while the tab already has an applier", async () => {
    api.injectFile.mockRejectedValue(new Error("refused"));
    api.runInPage.mockResolvedValue(false);
    await expect(ensureApplier(1, true)).resolves.toBeUndefined();
    api.runScene.mockResolvedValue({ gutters: "ok", scene: "shown", asset: "none" });
    await expect(ensureScene(1)).resolves.toBeUndefined();
  });
  it("a refusal with no applier in the tab is still an error", async () => {
    api.injectFile.mockRejectedValue(new Error("refused"));
    api.runInPage.mockResolvedValue(undefined);
    await expect(ensureApplier(1)).rejects.toThrow("refused");
    api.runScene.mockResolvedValue(undefined);
    await expect(ensureScene(1)).rejects.toThrow("refused");
  });
});
