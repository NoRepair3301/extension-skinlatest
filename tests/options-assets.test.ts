import { h, render } from "preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaDeps } from "../src/features/assets/prepare.ts";
import { PREPARE_MESSAGES } from "../src/features/assets/prepare.ts";
import { defaultPlacement, type AssetPlacement } from "../src/features/assets/types.ts";

const store = vi.hoisted(() => new Map<string, unknown>());
const api = vi.hoisted(() => ({ storageGet: vi.fn(), storageSet: vi.fn() }));
vi.mock("../src/extension/api.ts", () => api);

import { MyAssets } from "../src/extension/options/MyAssets.tsx";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20];
const deps: MediaDeps = {
  decodeImage: async () => ({ w: 100, h: 50, encode: async (_s, type) => new Uint8Array(type === "image/webp" ? WEBP : JPG) }),
  probeVideo: async () => ({ w: 10, h: 10, duration: 40, poster: async () => new Uint8Array(JPG) }),
  newId: () => "0a1b2c3d",
};

const fileOf = (bytes: number[] | string, name: string): File => {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  const f = new File([data], name);
  Object.defineProperty(f, "arrayBuffer", { value: async () => data.buffer.slice(0) });
  return f;
};

let placement: AssetPlacement;
const mount = async () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const draw = () => render(h(MyAssets, { placement, onPlacement: (p: AssetPlacement) => ((placement = p), draw()), deps }), root);
  await act(draw);
  await act(() => Promise.resolve());
  return root;
};
const upload = async (root: HTMLElement, f: File) => {
  const input = root.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [f], configurable: true });
  await act(() => void input.dispatchEvent(new Event("change", { bubbles: true })));
  await act(() => new Promise<void>((r) => setTimeout(r, 0)));
};
const status = (root: HTMLElement) => root.querySelector('[role="status"]')!.textContent;

describe("options: My assets", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    store.clear();
    placement = defaultPlacement();
    api.storageGet.mockImplementation(async (k: string) => store.get(k));
    api.storageSet.mockImplementation(async (k: string, v: unknown) => void store.set(k, v));
  });

  it("states that files stay on this device and shows the free space", async () => {
    const root = await mount();
    expect(root.textContent).toContain("Files stay on this device");
    expect(root.textContent).toContain("never shown to an AI");
    expect(root.textContent).toContain("7.0 MB free");
    expect(root.querySelector('input[type="file"]')!.getAttribute("accept")).not.toContain("svg");
  });

  it("uploads a picture, stores it under the assets key, lists it and selects it", async () => {
    const root = await mount();
    await upload(root, fileOf(PNG, "Holiday.png"));
    expect(status(root)).toBe("Saved.");
    const saved = store.get("assets") as Array<{ id: string; name: string; mime: string }>;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: "0a1b2c3d", name: "Holiday", mime: "image/webp" });
    expect(root.textContent).toContain("Holiday");
    expect(placement.assetId).toBe("0a1b2c3d");
    expect(root.textContent).toContain("Opacity");
  });

  it("refuses an SVG with a clear message and stores nothing", async () => {
    const root = await mount();
    await upload(root, fileOf('<svg xmlns="x"><script>alert(1)</script></svg>', "logo.svg"));
    expect(status(root)).toBe(PREPARE_MESSAGES.svg);
    expect(store.get("assets")).toBeUndefined();
  });

  it("refuses an over-long video and a wrong type with clear messages", async () => {
    const root = await mount();
    await upload(root, fileOf([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0], "clip.mp4"));
    expect(status(root)).toBe(PREPARE_MESSAGES["video-long"]);
    await upload(root, fileOf("just text", "notes.png"));
    expect(status(root)).toBe(PREPARE_MESSAGES.type);
    expect(store.get("assets")).toBeUndefined();
  });

  it("delete removes the file, frees its space and clears the selection", async () => {
    const root = await mount();
    await upload(root, fileOf(PNG, "Holiday.png"));
    const del = Array.from(root.querySelectorAll("button")).find((b) => b.textContent === "Delete")!;
    await act(() => del.click());
    await act(() => Promise.resolve());
    expect(store.get("assets")).toEqual([]);
    expect(placement.assetId).toBeNull();
    expect(status(root)).toBe("Deleted.");
  });

  it("a corrupt stored record is ignored when the page loads", async () => {
    store.set("assets", [{ id: "zz", data: "x" }, "junk"]);
    const root = await mount();
    expect(root.textContent).toContain("0 saved");
  });
});
