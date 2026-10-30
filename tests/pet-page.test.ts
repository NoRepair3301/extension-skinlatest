import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PageApplier } from "../src/extension/applier.ts";

const cfg = (over: Record<string, unknown> = {}) => ({ enabled: true, kind: "pebble" as const, size: "medium" as const, corner: "bottom-right" as const, disabledOrigins: [] as string[], ...over });
const slot = globalThis as unknown as { skinlyApplier?: PageApplier };
const hosts = () => document.querySelectorAll('[data-skinly-ui="pet"]');
let applier: PageApplier;

beforeAll(async () => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
  await import("../src/extension/applier.ts");
  applier = slot.skinlyApplier!;
});

afterEach(() => {
  applier.restore();
  document.body.innerHTML = "";
});

describe("pet does not depend on a theme (I)", () => {
  it("the page script is the top-frame applier", () => {
    expect(applier).toBeDefined();
    expect(applier.isActive()).toBe(false);
  });

  it("shows on a page that was never themed", () => {
    expect(hosts()).toHaveLength(0);
    expect(applier.syncPet(cfg())).toBe(true);
    expect(hosts()).toHaveLength(1);
  });

  it("shows after a theme that was refused or rolled back", () => {
    expect(applier.applyTheme("no-such-theme")).toMatchObject({ ok: false });
    expect(applier.isActive()).toBe(false);
    expect(applier.syncPet(cfg())).toBe(true);
    expect(hosts()).toHaveLength(1);
  });

  it("is removed by Restore", () => {
    applier.syncPet(cfg());
    expect(hosts()).toHaveLength(1);
    applier.restore();
    expect(hosts()).toHaveLength(0);
  });

  it("stays off when the setting is off or the origin is disabled", () => {
    expect(applier.syncPet(cfg({ enabled: false }))).toBe(false);
    expect(hosts()).toHaveLength(0);
    expect(applier.syncPet(cfg({ disabledOrigins: [location.origin] }))).toBe(false);
    expect(hosts()).toHaveLength(0);
  });

  it("turning the pet off removes a pet that is showing", () => {
    applier.syncPet(cfg());
    expect(applier.syncPet(cfg({ enabled: false }))).toBe(false);
    expect(hosts()).toHaveLength(0);
  });

  it("updatePet changes a showing pet but never brings a hidden one back", () => {
    expect(applier.updatePet(cfg())).toBe(false);
    expect(hosts()).toHaveLength(0);
    applier.syncPet(cfg());
    expect(applier.updatePet(cfg({ size: "large" }))).toBe(true);
    expect(hosts()).toHaveLength(1);
    expect(applier.updatePet(cfg({ enabled: false }))).toBe(false);
    expect(hosts()).toHaveLength(0);
  });
});
