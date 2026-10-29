import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_ENDPOINTS } from "../../src/config.ts";
import { createGemini, extractGeminiText } from "../../src/providers/gemini.ts";
import { createGroq, extractGroqText } from "../../src/providers/groq.ts";
import { kindForStatus, parseJsonAnswer, parseRetryAfter, type FetchFn } from "../../src/providers/http.ts";
import type { ErrorKind, Provider } from "../../src/providers/types.ts";

const KEY = "test-key-" + "z".repeat(12);
const PLAN = { v: 1, themeId: "ocean" };

type Reply = { status?: number; body?: unknown; raw?: string; headers?: Record<string, string> };
const reply = (r: Reply): Awaited<ReturnType<FetchFn>> => ({
  status: r.status ?? 200,
  headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null },
  text: async () => r.raw ?? JSON.stringify(r.body ?? {}),
});

const groqOk = (content: string): Reply => ({ body: { choices: [{ message: { role: "assistant", content } }] } });
const geminiOk = (text: string): Reply => ({ body: { output_text: text } });

const scripted = (replies: Reply[]) => {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  let i = 0;
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return reply(replies[Math.min(i++, replies.length - 1)]!);
  };
  return { fetchFn, calls };
};

const req = { system: "SYS", user: "USER", model: "m" };
const noSleep = async () => {};

describe.each([
  ["groq", (f: FetchFn) => createGroq(async () => KEY, { fetchFn: f, sleep: noSleep }), groqOk],
  ["gemini", (f: FetchFn) => createGemini(async () => KEY, { fetchFn: f, sleep: noSleep }), geminiOk],
] as const)("%s adapter", (id, make, ok) => {
  it("sends the documented request and returns the parsed JSON", async () => {
    const { fetchFn, calls } = scripted([ok(JSON.stringify(PLAN))]);
    const p: Provider = make(fetchFn);
    expect(p.id).toBe(id);
    expect(await p.generate(req)).toEqual({ ok: true, json: PLAN });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(PROVIDER_ENDPOINTS[id]);
    const body = JSON.parse(calls[0]!.body);
    expect(body.model).toBe("m");
    expect(JSON.stringify(body)).toContain("USER");
    expect(JSON.stringify(body)).toContain("SYS");
  });

  it("tolerates code fences and prose around the JSON", async () => {
    const { fetchFn } = scripted([ok("Here you go:\n```json\n" + JSON.stringify(PLAN) + "\n```")]);
    expect(await make(fetchFn).generate(req)).toEqual({ ok: true, json: PLAN });
  });

  it.each([["not json at all"], ["{broken"], [""]])("maps unusable answer %j to bad-output", async (answer) => {
    const { fetchFn } = scripted([ok(answer)]);
    expect(await make(fetchFn).generate(req)).toEqual({ ok: false, error: { kind: "bad-output" } });
  });

  it("maps a non-JSON HTTP body to bad-output", async () => {
    const { fetchFn } = scripted([{ raw: "<html>" }]);
    expect(await make(fetchFn).generate(req)).toEqual({ ok: false, error: { kind: "bad-output" } });
  });

  it("reports auth without calling the network when no key is set", async () => {
    const { fetchFn, calls } = scripted([ok("{}")]);
    const p = id === "groq" ? createGroq(async () => undefined, { fetchFn }) : createGemini(async () => undefined, { fetchFn });
    expect(await p.generate(req)).toEqual({ ok: false, error: { kind: "auth" } });
    expect(calls).toHaveLength(0);
  });

  it("maps a network failure to network", async () => {
    const fetchFn: FetchFn = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await make(fetchFn).generate(req)).toEqual({ ok: false, error: { kind: "network" } });
  });

  describe("retry rules", () => {
    it("retries once for 429 with retry-after of 5 s or less", async () => {
      const { fetchFn, calls } = scripted([{ status: 429, headers: { "retry-after": "2" } }, ok(JSON.stringify(PLAN))]);
      const sleep = vi.fn(async () => {});
      const p = id === "groq" ? createGroq(async () => KEY, { fetchFn, sleep }) : createGemini(async () => KEY, { fetchFn, sleep });
      expect(await p.generate(req)).toEqual({ ok: true, json: PLAN });
      expect(calls).toHaveLength(2);
      expect(sleep).toHaveBeenCalledWith(2000);
    });
    it("retries once for a 503 with retry-after 1", async () => {
      const { fetchFn, calls } = scripted([{ status: 503, headers: { "retry-after": "1" } }, ok(JSON.stringify(PLAN))]);
      expect((await make(fetchFn).generate(req)).ok).toBe(true);
      expect(calls).toHaveLength(2);
    });
    it("does not retry when retry-after is above 5 s, or absent", async () => {
      for (const headers of [{ "retry-after": "6" }, {}]) {
        const { fetchFn, calls } = scripted([{ status: 429, headers }, ok(JSON.stringify(PLAN))]);
        expect(await make(fetchFn).generate(req)).toEqual({ ok: false, error: { kind: "rate", ...(headers["retry-after" as never] ? { retryAfterMs: 6000 } : {}) } });
        expect(calls).toHaveLength(1);
      }
    });
    it("retries at most once", async () => {
      const { fetchFn, calls } = scripted([{ status: 429, headers: { "retry-after": "1" } }]);
      const r = await make(fetchFn).generate(req);
      expect(r).toEqual({ ok: false, error: { kind: "rate", retryAfterMs: 1000 } });
      expect(calls).toHaveLength(2);
    });
    it("never retries auth or client errors", async () => {
      for (const status of [401, 403, 400, 404, 422]) {
        const { fetchFn, calls } = scripted([{ status, headers: { "retry-after": "1" } }]);
        await make(fetchFn).generate(req);
        expect(calls).toHaveLength(1);
      }
    });
  });
});

describe("status to ErrorKind table", () => {
  const table: Array<[number, ErrorKind]> = [
    [400, "bad-output"],
    [401, "auth"],
    [403, "auth"],
    [404, "bad-output"],
    [408, "timeout"],
    [413, "bad-output"],
    [422, "bad-output"],
    [424, "bad-output"],
    [429, "rate"],
    [498, "server"],
    [499, "aborted"],
    [500, "server"],
    [502, "server"],
    [503, "server"],
    [504, "server"],
  ];
  it.each(table)("%i -> %s", (status, kind) => {
    expect(kindForStatus(status)).toBe(kind);
  });
  it("tells quota from rate on a 429 body that says quota", () => {
    expect(kindForStatus(429, "You exceeded your current quota")).toBe("quota");
  });
  it("reads error.message from provider error bodies", async () => {
    const fetchFn: FetchFn = async () => reply({ status: 429, body: { error: { message: "Quota exceeded for this project", type: "x" } } });
    expect(await createGroq(async () => KEY, { fetchFn }).generate(req)).toEqual({ ok: false, error: { kind: "quota" } });
  });
  it("parses retry-after in seconds", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter("0.5")).toBe(500);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT")).toBeUndefined();
  });
});

describe("answer extraction", () => {
  it("reads Groq choices[0].message.content", () => {
    expect(extractGroqText({ choices: [{ message: { content: "x" } }] })).toBe("x");
    for (const bad of [null, {}, { choices: [] }, { choices: [{}] }, { choices: [{ message: { content: 5 } }] }]) expect(extractGroqText(bad)).toBeUndefined();
  });
  it("reads the UNVERIFIED Gemini shapes and fails closed otherwise", () => {
    expect(extractGeminiText({ output_text: "x" })).toBe("x");
    expect(extractGeminiText({ steps: [{ type: "thought" }, { type: "model_output", content: [{ text: "a" }, { text: "b" }] }] })).toBe("ab");
    for (const bad of [null, {}, { steps: [] }, { steps: [{ type: "model_output" }] }, { candidates: [] }]) expect(extractGeminiText(bad)).toBeUndefined();
  });
  it("parseJsonAnswer finds an object inside prose", () => {
    expect(parseJsonAnswer('prefix {"a":1} suffix')).toEqual({ a: 1 });
    expect(parseJsonAnswer("none")).toBeUndefined();
  });
});

describe("timeouts and abort", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const hanging: FetchFn = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });

  it("times out after 15 s", async () => {
    const p = createGroq(async () => KEY, { fetchFn: hanging });
    const result = p.generate(req);
    await vi.advanceTimersByTimeAsync(14_999);
    let settled = false;
    void result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await result).toEqual({ ok: false, error: { kind: "timeout" } });
  });

  it("reports aborted when the caller aborts", async () => {
    const ctl = new AbortController();
    const result = createGemini(async () => KEY, { fetchFn: hanging }).generate({ ...req, signal: ctl.signal });
    await vi.advanceTimersByTimeAsync(100);
    ctl.abort();
    expect(await result).toEqual({ ok: false, error: { kind: "aborted" } });
  });

  it("reports aborted without calling fetch when already aborted", async () => {
    const fetchFn = vi.fn(hanging);
    const ctl = new AbortController();
    ctl.abort();
    expect(await createGroq(async () => KEY, { fetchFn }).generate({ ...req, signal: ctl.signal })).toEqual({ ok: false, error: { kind: "aborted" } });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("key safety", () => {
  const logs = () => [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "info"), vi.spyOn(console, "debug")];
  afterEach(() => vi.restoreAllMocks());

  it("never puts the key in the URL, the body, results, or console output", async () => {
    const spies = logs();
    const outcomes: Reply[] = [{ status: 401, body: { error: { message: "bad key " + KEY } } }, { status: 500 }, { raw: "oops " + KEY }, groqOk("nope " + KEY)];
    for (const r of outcomes) {
      const { fetchFn, calls } = scripted([r]);
      for (const p of [createGroq(async () => KEY, { fetchFn }), createGemini(async () => KEY, { fetchFn })]) {
        const result = await p.generate(req);
        expect(JSON.stringify(result)).not.toContain(KEY);
      }
      for (const c of calls) {
        expect(c.url).not.toContain(KEY);
        expect(c.body).not.toContain(KEY);
      }
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it("does not leak the key through a thrown fetch error", async () => {
    const fetchFn: FetchFn = async () => {
      throw new Error("connect failed for " + KEY);
    };
    const result = await createGroq(async () => KEY, { fetchFn }).generate(req);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("sends the key only in the documented header", async () => {
    const { fetchFn, calls } = scripted([groqOk("{}")]);
    await createGroq(async () => KEY, { fetchFn }).generate(req);
    expect(calls[0]!.headers["Authorization"]).toBe(`Bearer ${KEY}`);
    const g = scripted([geminiOk("{}")]);
    await createGemini(async () => KEY, { fetchFn: g.fetchFn }).generate(req);
    expect(g.calls[0]!.headers["x-goog-api-key"]).toBe(KEY);
  });
});
