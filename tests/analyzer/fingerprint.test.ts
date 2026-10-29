import { describe, expect, it } from "vitest";
import { fingerprint, fnv1a, similar, similarity } from "../../src/analyzer/fingerprint.ts";
import type { RegionRole } from "../../src/core/types.ts";

const fp = (roles: RegionRole[]) => fingerprint(roles.map((role) => ({ role, tag: "div" })));

describe("fingerprint", () => {
  it("matches known FNV-1a values", () => {
    expect(fnv1a("")).toBe("811c9dc5");
    expect(fnv1a("a")).toBe("e40c292c");
    expect(fnv1a("foobar")).toBe("bf9cf968");
  });
  it("is stable and encodes the role sequence", () => {
    const a = fp(["header", "nav", "main", "footer"]);
    expect(a).toEqual(fp(["header", "nav", "main", "footer"]));
    expect(a.seq).toBe("hnmf");
    expect(a.hash).toMatch(/^[0-9a-f]{8}$/);
  });
  it("uses only the first 40 regions", () => {
    const long = Array.from({ length: 50 }, () => "nav" as RegionRole);
    expect(fp(long).seq).toHaveLength(40);
  });
  it("treats near-identical sequences as similar and different ones as not", () => {
    const base = fp(["header", "nav", "main", "card-list", "card-list", "aside", "footer", "heading", "heading", "form"]);
    const near = fp(["header", "nav", "main", "card-list", "card-list", "aside", "footer", "heading", "heading"]);
    const far = fp(["table", "table", "form", "form", "section", "section", "aside", "aside", "nav", "nav"]);
    expect(similarity(base, base)).toBe(1);
    expect(similar(base, near)).toBe(true);
    expect(similar(base, far)).toBe(false);
  });
  it("treats two empty fingerprints as identical", () => {
    expect(similar(fp([]), fp([]))).toBe(true);
  });
});
