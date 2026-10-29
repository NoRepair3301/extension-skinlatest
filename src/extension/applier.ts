import { browserEnv, createPetController, type PetConfig } from "../features/pet/pet.ts";
import { createApplier, type Applier, type StyleHost } from "./applier-core.ts";
import { originOf } from "./origin.ts";

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

export type PageApplier = Applier & { syncPet(cfg: PetConfig): void };

const slot = globalThis as unknown as { skinlyApplier?: PageApplier };

function withPet(applier: Applier): PageApplier {
  const pet = createPetController(browserEnv(window));
  applier.onRestore(() => pet.destroy());
  return Object.assign(applier, {
    /** Shows or removes the pet for this page. Only the pet settings arrive here, never page data. */
    syncPet: (cfg: PetConfig): void => pet.sync(cfg, originOf(location.href), applier.isActive()),
  });
}

// Injecting the file twice must not replace the live instance, or its rollback ledger would be lost.
if (!slot.skinlyApplier) slot.skinlyApplier = withPet(createApplier(document, { style: adoptedSheetHost(document) }));
