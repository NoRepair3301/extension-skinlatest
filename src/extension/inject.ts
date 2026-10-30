import { injectFile, runInPage, runScene } from "./api.ts";

/**
 * Puts applier.js in the tab. The script keeps one live instance, so injecting it again is harmless; but a browser that refuses
 * the repeat (or a frame it may not enter) must not turn a working page into an error. The error counts only when the tab has no applier.
 */
export async function ensureApplier(tabId: number, allFrames = false): Promise<void> {
  try {
    if (allFrames) await injectFile(tabId, "applier.js", true);
    else await injectFile(tabId, "applier.js");
  } catch (e) {
    const present = await runInPage<boolean>(tabId, "isActive").catch(() => undefined);
    if (present === undefined) throw e;
  }
}

/** Same for scene.js, which only makes sense next to an applier. */
export async function ensureScene(tabId: number): Promise<void> {
  try {
    await injectFile(tabId, "scene.js");
  } catch (e) {
    const present = await runScene(tabId, "status").catch(() => undefined);
    if (present === undefined) throw e;
  }
}
