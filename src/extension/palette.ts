import { browserDeps, createPaletteController, type PaletteController } from "../features/palette/index.ts";
import { browserToasterEnv, createToaster } from "../features/toast/toast.ts";

// Injected on demand by the open-palette command. Injecting twice keeps the same instance.
const slot = globalThis as unknown as { skinlyPalette?: PaletteController; skinlyToast?: (text: string) => void };
if (!slot.skinlyPalette) slot.skinlyPalette = createPaletteController(browserDeps(window));
slot.skinlyToast ??= createToaster(browserToasterEnv(window)).show;
