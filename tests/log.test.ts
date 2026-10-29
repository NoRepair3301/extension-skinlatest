import { afterEach, describe, expect, it, vi } from "vitest";
import { debug, setDebug } from "../src/core/log.ts";

describe("log", () => {
  afterEach(() => {
    setDebug(false);
    vi.restoreAllMocks();
  });
  it("is silent by default", () => {
    const spies = [vi.spyOn(console, "debug"), vi.spyOn(console, "log"), vi.spyOn(console, "info")];
    debug("event", "code");
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
  it("logs only a short event and code when enabled", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    setDebug(true);
    debug("e".repeat(100), "c".repeat(100));
    const line = String(spy.mock.calls[0]![0]);
    expect(line.length).toBeLessThan(120);
    expect(line.startsWith("[skinly] ")).toBe(true);
  });
});
