export const SCREENSHOT_NOTE = "Only what you picked is blurred. Visible area only. Check the picture before you share it.";

export interface ScreenshotDeps {
  /** Current Share mode in the page. */
  getShare(): Promise<boolean>;
  /** Sets Share mode and resolves true once the page confirms it. */
  setShare(on: boolean): Promise<boolean>;
  /** PNG data URL of the visible area. */
  capture(): Promise<string>;
  now(): Date;
}

export type ScreenshotResult = { ok: true; blob: Blob; fileName: string } | { ok: false; reason: "not-confirmed" | "capture-failed" };

const pad = (n: number): string => String(n).padStart(2, "0");

export function fileNameFor(d: Date): string {
  return `skinly-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
}

/** Decodes a base64 PNG data URL without any network call. */
export function dataUrlToBlob(url: string): Blob {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(url);
  if (!m) throw new Error("not a png data url");
  const bin = atob(m[1]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

/** Turns Share mode on if needed, captures, and always puts the previous Share mode back. Nothing is uploaded. */
export async function safeScreenshot(deps: ScreenshotDeps): Promise<ScreenshotResult> {
  const before = await deps.getShare();
  let changed = false;
  try {
    if (!before) {
      changed = true;
      if (!(await deps.setShare(true))) return { ok: false, reason: "not-confirmed" };
    }
    const blob = dataUrlToBlob(await deps.capture());
    return { ok: true, blob, fileName: fileNameFor(deps.now()) };
  } catch {
    return { ok: false, reason: "capture-failed" };
  } finally {
    if (changed) await deps.setShare(before).catch(() => undefined);
  }
}
