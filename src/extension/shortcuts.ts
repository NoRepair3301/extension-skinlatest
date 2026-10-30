export interface CommandInfo {
  name: string;
  description: string;
  /** Empty when the browser did not assign a key. */
  shortcut: string;
}

/** The browser's own page for assigning extension shortcuts. Shown as text: opening it needs the tabs permission, which we do not have. */
export function shortcutsPage(userAgent: string, hasBraveApi: boolean): string {
  if (hasBraveApi) return "brave://extensions/shortcuts";
  if (/\bEdg(e|A|iOS)?\//.test(userAgent)) return "edge://extensions/shortcuts";
  return "chrome://extensions/shortcuts";
}

/** One line per command: its real key, or how to set one. */
export function shortcutLine(c: CommandInfo, page: string): string {
  return `${c.description}: ${c.shortcut.trim() !== "" ? c.shortcut : `Not set - open ${page}`}`;
}
