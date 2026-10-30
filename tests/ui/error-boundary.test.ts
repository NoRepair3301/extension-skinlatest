import { h, render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../src/ui/ErrorBoundary.tsx";

const Boom = () => {
  throw new Error("boom with secret page text");
};
const mount = async (vnode: unknown) => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  await act(() => render(vnode as never, root));
  return root;
};
const press = (root: HTMLElement, label: string) => act(async () => { Array.from(root.querySelectorAll("button")).find((b) => b.textContent === label)!.click(); });

describe("ErrorBoundary", () => {
  it("renders its children when nothing fails", async () => {
    const root = await mount(h(ErrorBoundary, {}, h("p", null, "fine")));
    expect(root.textContent).toBe("fine");
  });

  it("a crash shows a calm message and a Restore this page button, never a blank panel, and not the error text", async () => {
    const onRestore = vi.fn(async () => undefined);
    const root = await mount(h(ErrorBoundary, { onRestore }, h(Boom, {})));
    expect(root.querySelector('[role="alert"]')).toBeTruthy();
    expect(root.textContent).toContain("Something went wrong");
    expect(root.textContent).not.toContain("secret page text");
    await press(root, "Restore this page");
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain("This page was restored.");
  });

  it("a failing restore says what to do next", async () => {
    const root = await mount(h(ErrorBoundary, { onRestore: async () => { throw new Error("no tab"); } }, h(Boom, {})));
    await press(root, "Restore this page");
    expect(root.textContent).toContain("Reload it to get the original back");
  });

  it("without a restore action only Reload is offered, and it calls onReload", async () => {
    const onReload = vi.fn();
    const root = await mount(h(ErrorBoundary, { onReload }, h(Boom, {})));
    expect(Array.from(root.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Reload this panel"]);
    await press(root, "Reload this panel");
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
