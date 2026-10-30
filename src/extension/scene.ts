import { createAssetRenderer, type AssetRenderer, type AssetStatus } from "../features/assets/render.ts";
import { browserAssetEnv } from "../features/assets/media.ts";
import type { AssetRecord } from "../features/assets/types.ts";
import { pickCorner, type GutterState, type Gutters } from "../features/freespace/index.ts";
import { recordError } from "../core/diag.ts";
import { watchGutters, type GutterWatch } from "../features/freespace/watch.ts";
import { getScene } from "../features/scenes/index.ts";
import { createSceneEngine, type SceneEngine } from "../features/scenes/engine.ts";
import type { PageApplier } from "./applier.ts";
import { getAsset } from "./assetStore.ts";
import { siteRequest, type SceneRequest } from "./sceneConfig.ts";
import { defaultSettings, loadSettings, type Settings } from "./settings.ts";
import { getSite, originOf, type SiteRecord } from "./sites.ts";

/** What the popup learns: whether there was room, and what is showing. Fixed words only. */
export interface SceneStatusReport {
  gutters: GutterState;
  scene: "shown" | "corner" | "no-gutter" | "none";
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

/**
 * The request the auto script restores for a kept site: the scene of the stored plan's theme (art follows the theme, not a saved scene
 * id) while "Show art" is on, and the saved or chosen asset. Settings default when they cannot be read.
 */
export function requestFromSite(site: SiteRecord, settings: Settings = defaultSettings()): SceneRequest | null {
  return siteRequest(settings, site);
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

  /**
   * Draws everything for the current gutters. The asset status arrives later when the page blocks the file, so it is reported through
   * `done` too. Any failure is recorded and reported as nothing shown; it never reaches the page.
   */
  const render = async (g: Gutters, done?: (r: SceneStatusReport) => void): Promise<void> => {
    try {
      await draw(g, done);
    } catch {
      recordError("scene-render");
      report = { gutters: g.state, scene: "none", asset: "none" };
      done?.(report);
    }
  };

  const draw = async (g: Gutters, done?: (r: SceneStatusReport) => void): Promise<void> => {
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
      const guardedBegin = () => {
        try {
          begin();
        } catch {
          recordError("scene-measure");
          resolve(report);
        }
      };
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
      if (doc.body) return guardedBegin();
      // document_start: nothing to measure yet (an empty page looks like all gutter). The corner strip shows at once and moves to a
      // gutter after the first real measurement, when the DOM is parsed (then again on load, after 1 s and 3 s).
      if (needsGutters(next) && next.scene) {
        const corner = pickCorner([], win.innerWidth || 0, win.innerHeight || 0);
        if (corner) void render({ state: "none", corner });
      }
      doc.addEventListener("DOMContentLoaded", guardedBegin, { once: true });
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

  // The auto script (applier-auto.js) calls this once the saved theme is on the page; the art follows that theme and the "Show art" switch.
  const fromSite = async (site: SiteRecord) => {
    try {
      const settings = await loadSettings().catch(() => defaultSettings());
      const base = requestFromSite(site, settings);
      if (base) await slot.skinlyScene?.sync(base);
    } catch {
      recordError("auto-art");
    }
  };
  slot.skinlyOnApplied = (site) => void fromSite(site);
  const origin = originOf(location.href);
  if (origin && applier.isActive())
    void getSite(origin)
      .then((site) => {
        if (site && site.mode === "auto") void fromSite(site);
      })
      .catch(() => recordError("auto-art"));
}

try {
  install();
} catch {
  recordError("scene-mount");
}
