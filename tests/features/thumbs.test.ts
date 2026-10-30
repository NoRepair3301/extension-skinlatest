import { describe, expect, it } from "vitest";
import { drawPet } from "../../src/features/pet/art.ts";
import { sceneThumb } from "../../src/features/scenes/thumb.ts";
import { SCENE_IDS } from "../../src/features/scenes/types.ts";
import { PET_KINDS } from "../../src/extension/settings.ts";

describe("picker thumbnails come from the page's own art builders", () => {
  it.each(SCENE_IDS.filter((s) => s !== "none"))("scene %s draws an svg", (id) => {
    const svg = sceneThumb(document, id, "#2f6fdb");
    expect(svg?.localName).toBe("svg");
    expect(svg!.querySelectorAll("*").length).toBeGreaterThan(3);
  });
  it("two thumbnails in one document share no element id", () => {
    const a = sceneThumb(document, "space", "#2f6fdb")!;
    const b = sceneThumb(document, "ocean", "#2f6fdb")!;
    document.body.append(a, b);
    const ids = Array.from(document.querySelectorAll("[id]")).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    a.remove();
    b.remove();
  });
  it.each(PET_KINDS)("pet %s draws an svg", (kind) => {
    expect(drawPet(document, kind, "idle").localName).toBe("svg");
  });
});
