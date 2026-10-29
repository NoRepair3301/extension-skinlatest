import { createApplier, type Applier, type StyleHost } from "./applier-core.ts";

/** One constructable stylesheet, adopted by the document. */
const adoptedSheetHost = (doc: Document): StyleHost => ({
  add(css) {
    const win = doc.defaultView!;
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync(css);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    return {
      remove: () => {
        doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet);
      },
      isAttached: () => doc.adoptedStyleSheets.includes(sheet),
    };
  },
});

const slot = globalThis as unknown as { skinlyApplier?: Applier };

// Injecting the file twice must not replace the live instance, or its rollback ledger would be lost.
if (!slot.skinlyApplier) slot.skinlyApplier = createApplier(document, { style: adoptedSheetHost(document) });
