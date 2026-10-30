/** What a copy of the applier is running in. Cross-origin frames are skipped: we never touch a document we cannot read. */
export type FrameRole = "top" | "same-origin-frame" | "cross-origin-frame";

export function frameRole(win: Window): FrameRole {
  try {
    const top = win.top;
    if (top === win) return "top";
    if (!top) return "cross-origin-frame";
    // Reading the document of a cross-origin top throws a SecurityError.
    void top.document;
    return "same-origin-frame";
  } catch {
    return "cross-origin-frame";
  }
}
