import { describe, expect, it } from "vitest";
import { LOCALES, en, pickLocale } from "../../src/ui/strings.ts";

const shape = (v: unknown, path = ""): string[] =>
  typeof v === "object" && v !== null ? Object.entries(v).flatMap(([k, x]) => shape(x, `${path}.${k}`)) : [`${path}:${typeof v}`];
const texts = (v: unknown): string[] => (typeof v === "string" ? [v] : typeof v === "object" && v !== null ? Object.values(v).flatMap(texts) : []);

describe("strings", () => {
  it("every locale has exactly the keys and kinds of English", () => {
    for (const [name, locale] of Object.entries(LOCALES)) expect(shape(locale), name).toEqual(shape(en));
  });
  it("no empty text, and the privacy lines never promise more than the product does", () => {
    for (const t of texts(en)) expect(t.trim().length).toBeGreaterThan(0);
    expect(en.app.notAffiliated).toBe("Skinly AI is not affiliated with any website.");
  });
  it("an unknown or missing language falls back to English", () => {
    expect(pickLocale("xx-YY")).toBe(en);
    expect(pickLocale(undefined)).toBe(en);
    expect(pickLocale("EN-gb")).toBe(en);
  });
  it("the step text is a function of numbers", () => {
    expect(en.welcome.step(2, 3)).toBe("Step 2 of 3");
  });
});
