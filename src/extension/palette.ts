import { browserDeps, createPaletteController, type PaletteController } from "../features/palette/index.ts";

// Injected on demand by the open-palette command. Injecting twice keeps the same instance.
const slot = globalThis as unknown as { skinlyPalette?: PaletteController };
if (!slot.skinlyPalette) slot.skinlyPalette = createPaletteController(browserDeps(window));
