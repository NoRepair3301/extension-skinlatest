import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The scanner is plain ESM with no type declarations; load it untyped on purpose
// (the project has no @types/node and the script must stay dependency-free).
type Hit = { path: string; line: number; text: string; cls: string; reason?: string };
type Scanner = {
  scan(files: { path: string; content: string }[], allow: object[]): { hits: Hit[]; allowed: Hit[] };
  classify(m: { path: string; text: string }): string;
  exitCode(r: { hits: unknown[] }): number;
  collectFiles(root: string): { path: string; content: string }[];
};
const load = (spec: string): Promise<any> => import(/* @vite-ignore */ spec); // eslint-disable-line @typescript-eslint/no-explicit-any
const posix = resolve("scripts/rename-check.mjs").split("\\").join("/");
const mod = (await load(posix.startsWith("/") ? `file://${posix}` : `file:///${posix}`)) as Scanner;

const TMP = resolve("node_modules/.rename-check-test");
const put = (rel: string, data: string | Uint8Array) => {
  const full = join(TMP, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
};
afterAll(async () => {
  const fs = await load("node:fs");
  fs.rmSync(TMP, { recursive: true, force: true });
});

const file = (path: string, content: string) => ({ path, content });
const OLD = "data-skinly-engine";

describe("rename-check scan", () => {
  it("finds a hit with path, line and class", () => {
    const r = mod.scan([file("src/a.ts", `ok\nconst m = "${OLD}";\n`)], []);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({ path: "src/a.ts", line: 2, cls: "A" });
  });

  it("matches case-insensitively and finds nothing in clean files", () => {
    expect(mod.scan([file("a.md", "SKINLY and Skinly AI")], []).hits).toHaveLength(1);
    expect(mod.scan([file("a.md", "Repaint only")], []).hits).toHaveLength(0);
  });

  it("respects an allowlist path entry (prefix)", () => {
    const r = mod.scan([file("docs/archive/x.md", "Skinly AI"), file("src/x.ts", "Skinly AI")], [{ path: "docs/archive/", reason: "history" }]);
    expect(r.hits.map((h) => h.path)).toEqual(["src/x.ts"]);
    expect(r.allowed.map((h) => h.path)).toEqual(["docs/archive/x.md"]);
    expect(r.allowed[0]?.reason).toBe("history");
  });

  it("respects a pattern entry: only matching lines are hidden", () => {
    const content = "legacy skinly1: import\nnew skinly1: text\n";
    const r = mod.scan([file("src/codes.ts", content)], [{ path: "src/", pattern: "legacy.*skinly1:", reason: "compat" }]);
    expect(r.allowed).toHaveLength(1);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]?.line).toBe(2);
  });

  it("rejects an allowlist entry with no reason", () => {
    expect(() => mod.scan([], [{ path: "docs/" }])).toThrow(/no reason/);
    expect(() => mod.scan([], [{ path: "docs/", reason: "  " }])).toThrow(/no reason/);
  });

  it("reports a file whose name carries the old name", () => {
    const r = mod.scan([file("assets/skinly-logo.svg", "<svg/>")], []);
    expect(r.hits).toHaveLength(1);
  });
});

describe("rename-check classify", () => {
  const c = (text: string, path = "src/a.ts") => mod.classify({ path, text });
  it("data-skinly-engine is class A", () => expect(c(`"${OLD}"`)).toBe("A"));
  it("skinly1: is class F", () => expect(c("code starts with skinly1:")).toBe("F"));
  it("globals are class B, bundle names class D", () => {
    expect(c("globalThis.skinlyApplier")).toBe("B");
    expect(c('name: "SkinlyApplier"', "vite.config.ts")).toBe("D");
  });
  it("history paths are class K whatever the text", () => expect(c(OLD, "docs/archive/premium/a.md")).toBe("K"));
});

describe("rename-check files and exit code", () => {
  it("skips node_modules, dist, .git, private and binary files", () => {
    put("keep/a.ts", "Skinly");
    put("node_modules/p/a.ts", "Skinly");
    put("dist/a.js", "Skinly");
    put(".git/a", "Skinly");
    put("private/a.txt", "Skinly");
    put("keep/b.png", "Skinly");
    put("keep/nul.dat", new Uint8Array([83, 107, 105, 110, 108, 121, 0, 1]));
    const files = mod.collectFiles(TMP);
    const withText = files.filter((f) => f.content !== "").map((f) => f.path.split("\\").join("/"));
    expect(withText).toEqual(["keep/a.ts"]);
    const names = files.map((f) => f.path.split("\\").join("/"));
    expect(names.some((p) => p.startsWith("node_modules") || p.startsWith("dist") || p.startsWith(".git") || p.startsWith("private"))).toBe(false);
  });

  it("exit code is 0 with no hits and 1 with hits", () => {
    expect(mod.exitCode(mod.scan([file("a.ts", "Repaint")], []))).toBe(0);
    expect(mod.exitCode(mod.scan([file("a.ts", "Skinly")], []))).toBe(1);
    expect(mod.exitCode(mod.scan([file("a.ts", "Skinly")], [{ path: "a.ts", reason: "x" }]))).toBe(0);
  });

  it("the CLI exits 1 on leftovers, 0 when clean and 2 on a bad allowlist", async () => {
    const { spawnSync } = await load("node:child_process");
    const script = resolve("scripts/rename-check.mjs");
    const run = (root: string) => spawnSync(process.argv[0], [script, "--root", root], { encoding: "utf8" }).status;
    put("cli-dirty/a.ts", "Skinly");
    put("cli-clean/a.ts", "Repaint");
    put("cli-bad/a.ts", "Skinly");
    put("cli-bad/scripts/rename-allowlist.json", JSON.stringify([{ path: "a.ts" }]));
    expect(run(join(TMP, "cli-dirty"))).toBe(1);
    expect(run(join(TMP, "cli-clean"))).toBe(0);
    expect(run(join(TMP, "cli-bad"))).toBe(2);
  });
});
