import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { THEMES } from "../../src/themes/index.ts";
import { createColorEngine } from "../../src/engine/dom.ts";

describe("engine/dom", () => {
  it("applies theme styles to DOM elements", () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body style="background-color: rgb(255, 255, 255); color: rgb(0, 0, 0);">
          <div id="card" style="background-color: rgb(240, 240, 240); border: 1px solid rgb(200, 200, 200);">
            <p id="para" style="color: rgb(30, 30, 30);">Hello world</p>
          </div>
        </body>
      </html>
    `);

    const doc = dom.window.document;
    const midnight = THEMES.find((t) => t.id === "midnight")!;
    const engine = createColorEngine(doc, midnight);

    engine.apply();
    expect(engine.isActive()).toBe(true);
    expect(doc.documentElement.getAttribute("data-skinly")).toBe("on");

    const card = doc.getElementById("card")!;
    expect(card.hasAttribute("data-skinly-engine")).toBe(true);
    expect(card.style.getPropertyValue("background-color")).not.toBe("rgb(240, 240, 240)");
  });

  it("idempotence: applying twice results in the same state as applying once", () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body style="background-color: rgb(255, 255, 255);">
          <div id="card" style="background-color: rgb(240, 240, 240); color: rgb(10, 10, 10);">
            Content
          </div>
        </body>
      </html>
    `);

    const doc = dom.window.document;
    const midnight = THEMES.find((t) => t.id === "midnight")!;
    const engine = createColorEngine(doc, midnight);

    engine.apply();
    const card = doc.getElementById("card")!;
    const firstBg = card.style.getPropertyValue("background-color");
    const firstColor = card.style.getPropertyValue("color");

    // Apply again
    engine.apply();
    expect(card.style.getPropertyValue("background-color")).toBe(firstBg);
    expect(card.style.getPropertyValue("color")).toBe(firstColor);
  });

  it("restore returns exact original inline styles and priority", () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body style="background-color: rgb(255, 255, 255);">
          <div id="card" style="background-color: rgb(240, 240, 240) !important; color: rgb(10, 10, 10);">
            <span id="label">No inline style</span>
          </div>
        </body>
      </html>
    `);

    const doc = dom.window.document;
    const midnight = THEMES.find((t) => t.id === "midnight")!;
    const engine = createColorEngine(doc, midnight);

    engine.apply();

    const card = doc.getElementById("card")!;
    const label = doc.getElementById("label")!;
    expect(card.hasAttribute("data-skinly-engine")).toBe(true);

    engine.restore();

    expect(engine.isActive()).toBe(false);
    expect(doc.documentElement.getAttribute("data-skinly")).toBeNull();
    expect(card.hasAttribute("data-skinly-engine")).toBe(false);
    expect(label.hasAttribute("data-skinly-engine")).toBe(false);

    // Exact original inline style and priority restored
    expect(card.style.getPropertyValue("background-color")).toBe("rgb(240, 240, 240)");
    expect(card.style.getPropertyPriority("background-color")).toBe("important");
    expect(card.style.getPropertyValue("color")).toBe("rgb(10, 10, 10)");
    expect(label.style.getPropertyValue("color")).toBe("");
  });

  it("never touches media elements (img, video, canvas) or Skinly UI", () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body style="background-color: rgb(255, 255, 255);">
          <img id="image" style="background-color: rgb(200, 200, 200);" src="test.jpg" />
          <canvas id="canvas" style="background-color: rgb(200, 200, 200);"></canvas>
          <video id="video" style="background-color: rgb(200, 200, 200);"></video>
          <div id="skinly-pet" data-skinly-pet style="background-color: rgb(255, 255, 255);">Pet</div>
          <div id="skinly-ui-box" data-skinly-ui="banner" style="background-color: rgb(255, 255, 255);">
            <p id="skinly-child" style="color: rgb(0, 0, 0);">UI child</p>
          </div>
        </body>
      </html>
    `);

    const doc = dom.window.document;
    const midnight = THEMES.find((t) => t.id === "midnight")!;
    const engine = createColorEngine(doc, midnight);

    engine.apply();

    expect(doc.getElementById("image")!.hasAttribute("data-skinly-engine")).toBe(false);
    expect(doc.getElementById("canvas")!.hasAttribute("data-skinly-engine")).toBe(false);
    expect(doc.getElementById("video")!.hasAttribute("data-skinly-engine")).toBe(false);
    expect(doc.getElementById("skinly-pet")!.hasAttribute("data-skinly-engine")).toBe(false);
    expect(doc.getElementById("skinly-ui-box")!.hasAttribute("data-skinly-engine")).toBe(false);
    expect(doc.getElementById("skinly-child")!.hasAttribute("data-skinly-engine")).toBe(false);
  });

  it("traverses and themes open shadow roots", () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body style="background-color: rgb(255, 255, 255);">
          <div id="host"></div>
        </body>
      </html>
    `);

    const doc = dom.window.document;
    const host = doc.getElementById("host")!;
    const shadow = host.attachShadow({ mode: "open" });
    const inner = doc.createElement("div");
    inner.setAttribute("style", "background-color: rgb(240, 240, 240); color: rgb(20, 20, 20);");
    inner.textContent = "Shadow content";
    shadow.appendChild(inner);

    const midnight = THEMES.find((t) => t.id === "midnight")!;
    const engine = createColorEngine(doc, midnight);

    engine.apply();

    expect(inner.hasAttribute("data-skinly-engine")).toBe(true);

    engine.restore();
    expect(inner.hasAttribute("data-skinly-engine")).toBe(false);
    expect(inner.style.getPropertyValue("background-color")).toBe("rgb(240, 240, 240)");
  });
});
