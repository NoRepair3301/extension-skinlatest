// Dev only, never bundled: writes private/preview.html so a human can look at every scene, pet and theme in a browser.
import { mkdirSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { computeGutters } from "../src/features/freespace/index.ts";
import { POSES, drawPet } from "../src/features/pet/art.ts";
import { CREATURES } from "../src/features/pet/creatures.ts";
import { SCENE_CSS } from "../src/features/scenes/css.ts";
import { createSceneEngine } from "../src/features/scenes/engine.ts";
import { SCENES } from "../src/features/scenes/index.ts";
import { THEMES } from "../src/themes/index.ts";

const WIDTHS = [900, 1280, 1920] as const;
const HEIGHT = 560;
const COLUMN = 640;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const { document: doc, window: win } = dom.window;
Object.defineProperty(win, "innerHeight", { value: HEIGHT });

/** Serialise the lanes the real engine builds for one scene at one width, with a fake centred content column. */
function lanesFor(sceneIndex: number, width: number, accent: string): string {
  const x = Math.round((width - COLUMN) / 2);
  const gutters = computeGutters([{ x, y: 0, w: COLUMN, h: HEIGHT }] as never, width, width);
  const engine = createSceneEngine({ doc: doc as unknown as Document, win: win as unknown as Window });
  engine.show({ scene: SCENES[sceneIndex]!, density: "high", lane: "both", gutters, accent });
  const root = engine.host()?.shadowRoot?.querySelector(".root");
  const html = root ? root.innerHTML : "";
  engine.destroy();
  return html;
}

const themeAccent = (id: string) => THEMES.find((t) => t.id === id)?.tokens.accent ?? "#0a7ea4";
const sceneTheme: Record<string, string> = { paper: "warm-paper", space: "midnight", ocean: "ocean", "midnight-stars": "midnight", calm: "calm-light", field: "field" };

const stages: string[] = [];
const templates: string[] = [];
SCENES.forEach((s, i) => {
  const accent = themeAccent(sceneTheme[s.id] ?? "calm-light");
  const dark = sceneTheme[s.id] === "midnight";
  for (const w of WIDTHS) {
    const key = `${s.id}-${w}`;
    templates.push(`<template id="t-${key}">${lanesFor(i, w, accent)}</template>`);
    stages.push(
      `<figure><figcaption>${esc(s.name)} at ${w}px</figcaption><div class="stage${dark ? " dark" : ""}" style="width:${w}px;height:${HEIGHT}px" data-key="${key}">` +
        `<div class="column" style="width:${COLUMN}px">Fake content column<br>Art must stay out of it.</div></div></figure>`,
    );
  }
});

const pets = CREATURES.map((k) => {
  const row = POSES.map((p) => `<div class="pose">${drawPet(doc as unknown as Document, k, p, "#c2410c").outerHTML}<small>${p}</small></div>`).join("");
  return `<h3>${k}</h3><div class="row">${row}</div>`;
}).join("");

const swatches = THEMES.map(
  (t) => `<div class="sw" style="background:${t.tokens.bg};color:${t.tokens.text}"><b>${esc(t.name)}</b>` + Object.entries(t.tokens).filter(([, v]) => typeof v === "string" && String(v).startsWith("#")).map(([k, v]) => `<i style="background:${v}" title="${k}">${k}</i>`).join("") + "</div>",
).join("");

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Skinly AI preview (dev only)</title><style>
body{font:15px system-ui,sans-serif;margin:16px;background:#ddd}figure{margin:12px 0}.stage{position:relative;overflow:hidden;background:#f5f5f5;border:1px solid #888}
.stage.dark{background:#10162a}.column{position:absolute;left:50%;top:0;bottom:0;transform:translateX(-50%);background:rgba(120,120,120,.25);padding:8px;box-sizing:border-box}
.row{display:flex;flex-wrap:wrap;gap:8px}.pose{width:110px;text-align:center;background:#fff;border:1px solid #bbb}.pose svg{width:96px;height:96px}
.sw{display:inline-block;margin:4px;padding:8px;border:1px solid #888;width:220px}.sw i{display:inline-block;margin:2px;padding:2px 4px;font-size:11px;color:#000;text-shadow:0 0 2px #fff}
</style></head><body><h1>Scenes</h1>${stages.join("")}${templates.join("")}<h1>Pets</h1>${pets}<h1>Themes</h1>${swatches}
<script>
const css=${JSON.stringify(SCENE_CSS)};
document.querySelectorAll(".stage").forEach(function(st){var t=document.getElementById("t-"+st.dataset.key);var h=document.createElement("div");h.style.cssText="position:absolute;inset:0;pointer-events:none";var s=h.attachShadow({mode:"open"});var style=document.createElement("style");style.textContent=css;var r=document.createElement("div");r.className="root";r.style.position="absolute";r.append(t.content.cloneNode(true));s.append(style,r);st.append(h);});
</script></body></html>`;

mkdirSync("private", { recursive: true });
writeFileSync("private/preview.html", page);
process.stdout.write(`preview: wrote private/preview.html (${SCENES.length} scenes x ${WIDTHS.length} widths, ${CREATURES.length} pets x ${POSES.length} poses, ${THEMES.length} themes)\n`);
