import { indexItems } from "./index-items.ts";
import { openPalette, type Palette, type PaletteDeps } from "./ui.ts";

const MARK = "data-skinly-found";
const SHEET = `[${MARK}]{outline:3px solid #1d4ed8!important;outline-offset:2px!important}`;

/** Outline via one temporary constructable stylesheet and one data attribute; both go away with the timer. */
export function browserDeps(win: Window & typeof globalThis): PaletteDeps {
  const doc = win.document;
  return {
    doc,
    highlight(el) {
      const sheet = new win.CSSStyleSheet();
      sheet.replaceSync(SHEET);
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
      el.setAttribute(MARK, "");
      return () => {
        el.removeAttribute(MARK);
        doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet);
      };
    },
    setTimeout: (fn, ms) => win.setTimeout(fn, ms),
    clearTimeout: (id) => win.clearTimeout(id),
  };
}

export interface PaletteController {
  open(): void;
  close(): void;
}

/** One palette at a time; opening again replaces the open one. Nothing is stored. */
export function createPaletteController(deps: PaletteDeps): PaletteController {
  let current: Palette | undefined;
  return {
    open() {
      current?.close();
      current = openPalette(deps, indexItems(deps.doc));
    },
    close() {
      current?.close();
      current = undefined;
    },
  };
}
