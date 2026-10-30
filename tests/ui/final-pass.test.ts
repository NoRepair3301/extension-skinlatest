import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { callJson } from "../../src/providers/http.ts";
import { isOnline } from "../../src/ui/online.ts";
import { catchUnhandled } from "../../src/ui/safety.ts";

const tsx = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? tsx(p) : p.endsWith(".tsx") ? [p] : [];
  });

describe("UI text lives in src/ui/strings.ts (stage 3)", () => {
  it("no component has a bare line of English text, a literal label or a literal aria-label", () => {
    const found: string[] = [];
    for (const file of [...tsx("src/extension"), ...tsx("src/ui")]) {
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, "").trim();
          if (code.startsWith("*") || code.startsWith("/*")) return;
          // a JSX text line such as `Show pet on this page` or `>Save key<`
          if (/^[A-Z][a-z]+(?: [a-z]+)+\.?$/.test(code) || />[A-Z][a-z]+ [a-z][^<{]*</.test(code)) found.push(`${file}:${i + 1}`);
          // aria-label="Words", placeholder="Words" (example.org and the like are data, not prose)
          if (/(?:aria-label|placeholder|title)="[A-Z][a-z]+ /.test(code)) found.push(`${file}:${i + 1}`);
        });
    }
    expect(found).toEqual([]);
  });
});

describe("offline (stage 3)", () => {
  it("isOnline reads navigator.onLine and treats an unknown state as online", () => {
    expect(isOnline({ onLine: false })).toBe(false);
    expect(isOnline({ onLine: true })).toBe(true);
    expect(isOnline({})).toBe(true);
    expect(isOnline(undefined)).toBe(true);
  });

  it("a provider call while offline fails at once as a network error and never fetches", async () => {
    const fetchFn = vi.fn();
    const r = await callJson({ url: "https://api.groq.com/x", headers: {}, body: {}, extractText: () => "{}" }, { system: "", user: "" } as never, { fetchFn, online: () => false });
    expect(r).toEqual({ ok: false, error: { kind: "network" } });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("no unhandled promise rejection reaches the console (stage 3)", () => {
  it("catchUnhandled records the short kind 'unhandled' and stops the event", () => {
    const seen: string[][] = [];
    const off = catchUnhandled(window, (k) => void seen.push(k));
    const ev = new Event("unhandledrejection", { cancelable: true }) as PromiseRejectionEvent;
    window.dispatchEvent(ev);
    expect(seen).toEqual([["unhandled"]]);
    expect(ev.defaultPrevented).toBe(true);
    off();
    window.dispatchEvent(new Event("unhandledrejection", { cancelable: true }));
    expect(seen).toHaveLength(1);
  });

  it("a recorder that throws or rejects is swallowed too", () => {
    const off = catchUnhandled(window, () => {
      throw new Error("x");
    });
    expect(() => window.dispatchEvent(new Event("unhandledrejection", { cancelable: true }))).not.toThrow();
    off();
    const off2 = catchUnhandled(window, () => Promise.reject(new Error("y")));
    expect(() => window.dispatchEvent(new Event("unhandledrejection", { cancelable: true }))).not.toThrow();
    off2();
  });
});
