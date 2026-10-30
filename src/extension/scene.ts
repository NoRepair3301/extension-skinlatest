import { createAssetRenderer, type AssetRenderer, type AssetStatus } from "../features/assets/render.ts";
import { browserAssetEnv } from "../features/assets/media.ts";
import type { AssetRecord } from "../features/assets/types.ts";
import type { GutterState, Gutters } from "../features/freespace/index.ts";
import { watchGutters, type GutterWatch } from "../features/freespace/watch.ts";
import { getScene } from "../features/scenes/index.ts";
import { createSceneEngine, type SceneEngine } from "../features/scenes/engine.ts";
import type { PageApplier } from "./applier.ts";
import { getAsset } from "./assetStore.ts";
import type { SceneRequest } from "./sceneConfig.ts";
import { getSite, originOf, type SiteRecord } from "./sites.ts";

/** What the popup learns: whether there was room, and what is showing. Fixed words only. */
export interface SceneStatusReport {
  gutters: GutterState;
  scene: "shown" | "no-gutter" | "none";
  asset: AssetStatus | "none" | "missing";
}

export interface PageScene {
  /** Shows (or re-shows) the request and reports what happened. */
  sync(req: SceneRequest | null): Promise<SceneStatusReport>;
  /** Like sync, but does nothing unless art is already showing (used when only a setting changed). */
  update(req: SceneRequest | null): Promise<SceneStatusReport>;
  status(): SceneStatusReport;
  destroy(): void;
}

type Slot = typeof globalThis & {
  skinlyScene?: PageScene | undefined;
  skinlyApplier?: PageApplier;
  skinlyOnApplied?: (site: SiteRecord) => void;
};

/** The request the auto script restores from a site record: its saved scene and asset, on the saved plan's accent. */
export function requestFromSite(site: SiteRecord): SceneRequest | null {
  const look = site.look;
  if (!look) return null;
  const accent = typeof site.plan.tokens?.accent === "string" ? site.plan.tokens.accent : "#2f6fdb";
  const scene = look.scene && look.scene.id !== "none" ? { sceneId: look.scene.id, density: look.scene.density, lane: look.scene.lane, accent } : null;
  const asset = look.asset && look.asset.assetId !== null ? look.asset : null;
  if (!scene && !asset) return null;
  return { scene, asset, fallback: null };
}

/** The box around the text an element itself holds (not its children's), when the browser can measure it. */
function textExtent(doc: Document, el: Element): { x: number; y: number; w: number; h: number } | undefined {
  try {
    const range = doc.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect?.();
    return r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : undefined;
  } catch {
    return undefined;
  }
}

const slimCache = new WeakMap<Element, boolean>();
/** Is this element inside a fixed or sticky strip shorter than a quarter of the window (a header or toolbar)? Checked up to 6 levels up. */
function inSlimBar(win: Window, el: Element, height: number): boolean {
  if (height >= win.innerHeight * 0.25) return false;
  let cur: Element | null = el;
  for (let i = 0; i < 6 && cur; i++, cur = cur.parentElement) {
    let fixed = slimCache.get(cur);
    if (fixed === undefined) {
      const pos = win.getComputedStyle(cur).position;
      fixed = (pos === "fixed" || pos === "sticky") && cur.getBoundingClientRect().height < win.innerHeight * 0.25;
      slimCache.set(cur, fixed);
    }
    if (fixed) return true;
  }
  return false;
}

export function createPageScene(win: Window): PageScene {
  const doc = win.document;
  const engine: SceneEngine = createSceneEngine({ doc, win });
  const assets: AssetRenderer = createAssetRenderer(browserAssetEnv(win));
  let watch: GutterWatch | undefined;
  let req: SceneRequest | null = null;
  let report: SceneStatusReport = { gutters: "none", scene: "none", asset: "none" };
  let cache: AssetRecord | undefined;
  let alive = true;

  const stop = () => {
    watch?.destroy();
    watch = undefined;
    engine.hide();
    assets.hide();
    req = null;
  };

  const assetRecord = async (id: string): Promise<AssetRecord | undefined> => {
    if (cache?.id === id) return cache;
    cache = await getAsset(id).catch(() => undefined);
    return cache;
  };

  /** Draws everything for the current gutters. The asset status arrives later when the page blocks the file, so it is reported through `done` too. */
  const render = async (g: Gutters, done?: (r: SceneStatusReport) => void): Promise<void> => {
    if (!alive || !req) return;
    const now = req;
    let sceneStatus: SceneStatusReport["scene"] = "none";
    if (now.scene) {
      const def = getScene(now.scene.sceneId);
      sceneStatus = def ? engine.show({ scene: def, density: now.scene.density, lane: now.scene.lane, gutters: g, accent: now.scene.accent }) : "none";
    } else engine.hide();
    report = { gutters: g.state, scene: sceneStatus, asset: "none" };
    if (!now.asset || now.asset.assetId === null) {
      assets.hide();
      done?.(report);
      return;
    }
    const record = await assetRecord(now.asset.assetId);
    if (!alive || req !== now) return;
    if (!record) {
      assets.hide();
      report = { ...report, asset: "missing" };
      done?.(report);
      return;
    }
    let first = true;
    assets.show({ record, placement: now.asset, gutters: g }, (s) => {
      if (!alive || req !== now) return;
      report = { ...report, asset: s };
      if (s === "failed" && now.fallback && report.scene !== "shown") {
        const def = getScene(now.fallback.sceneId);
        if (def) report = { ...report, scene: engine.show({ scene: def, density: now.fallback.density, lane: now.fallback.lane, gutters: g, accent: now.fallback.accent }) };
      }
      if (first) {
        first = false;
        done?.(report);
      }
    });
  };

  const needsGutters = (r: SceneRequest): boolean => r.scene !== null || (r.asset !== null && r.asset.mode === "lane");

  const start = (next: SceneRequest): Promise<SceneStatusReport> =>
    new Promise((resolve) => {
      watch?.destroy();
      watch = undefined;
      req = next;
      const begin = () => {
        if (!alive || req !== next) return resolve(report);
        const finish = (r: SceneStatusReport) => resolve(r);
        if (!needsGutters(next)) {
          void render({ state: "ok" }, finish);
          return;
        }
        let firstPaint = true;
        watch = watchGutters(
          {
            doc,
            win,
            getRect: (el) => {
              const r = el.getBoundingClientRect();
              return { x: r.left, y: r.top, w: r.width, h: r.height };
            },
            isHidden: (el) => {
              const cs = win.getComputedStyle(el);
              return cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0";
            },
            textRect: (el) => textExtent(doc, el),
            ignore: (el, rect) => inSlimBar(win, el, rect.h),
            setTimeout: (fn, ms) => win.setTimeout(fn, ms),
            clearTimeout: (id) => win.clearTimeout(id),
            now: () => Date.now(),
          },
          (g) => {
            void render(g, firstPaint ? ((firstPaint = false), finish) : undefined);
          },
        );
        // the watcher reports only changes; "no gutters at all" is a result too
        if (firstPaint) {
          firstPaint = false;
          void render(watch.current(), finish);
        }
      };
      if (doc.body) begin();
      else doc.addEventListener("DOMContentLoaded", begin, { once: true });
    });

  return {
    sync(next) {
      if (!next) {
        stop();
        return Promise.resolve({ gutters: "none", scene: "none", asset: "none" });
      }
      return start(next);
    },
    update(next) {
      if (!req && !next) return Promise.resolve(report);
      if (!req) return Promise.resolve(report); // nothing showing: a setting change never brings art back
      if (!next) {
        stop();
        return Promise.resolve({ gutters: "none", scene: "none", asset: "none" });
      }
      return start(next);
    },
    status: () => report,
    destroy() {
      stop();
      alive = false;
    },
  };
}

/** Registers the page script once. Restore (the applier's rollback) removes everything it shows. */
function install(): void {
  const slot = globalThis as Slot;
  if (slot.skinlyScene) return;
  const applier = slot.skinlyApplier;
  if (!applier) return; // only the top frame has an applier
  const scene = createPageScene(window);
  slot.skinlyScene = scene;
  applier.onRestore(() => {
    scene.destroy();
    slot.skinlyScene = undefined;
  });

  // The auto script (applier-auto.js) calls this once the saved theme is on the page.
  // A saved look already holds the choices, so the global scene and asset settings are not read here.
  const fromSite = async (site: SiteRecord) => {
    const base = requestFromSite(site);
    if (base) await slot.skinlyScene?.sync(base);
  };
  slot.skinlyOnApplied = (site) => void fromSite(site);
  const origin = originOf(location.href);
  if (origin && applier.isActive()) void getSite(origin).then((site) => {
      if (site && site.mode === "auto") void fromSite(site);
    });
}

install();
