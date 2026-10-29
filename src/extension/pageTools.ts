import { createBlurController, type BlurState, type StyleSheetHost } from "../features/blur/apply.ts";
import { startPick, type PickSession } from "../features/blur/pick.ts";
import { createTableTools } from "../features/tables/tools.ts";

export type ToolState = BlurState & { picked: string[]; picking: boolean };

export interface PageTools {
  blurTargets(selectors: string[], images: boolean): ToolState;
  blurShare(on: boolean): ToolState;
  blurState(): ToolState;
  pickStart(): ToolState;
  pickStop(): ToolState;
  tablesEnable(): number;
  tablesFilter(query: string): number;
  tablesRestoreOrder(): void;
  /** Everything the tools changed, back to the original. */
  restore(): void;
}

/** Page side of the privacy and table tools. Arguments and results are plain data (no page text). */
export function createPageTools(doc: Document, style: StyleSheetHost): PageTools {
  const blur = createBlurController(doc, style);
  const tables = createTableTools(doc, style);
  const picked: string[] = [];
  let session: PickSession | undefined;

  const state = (): ToolState => ({ ...blur.state(), picked: [...picked], picking: session?.active() ?? false });

  const stopPick = () => {
    session?.stop();
    session = undefined;
  };

  return {
    blurTargets(selectors, images) {
      picked.splice(0, picked.length, ...selectors);
      blur.setTargets(picked, images);
      return state();
    },
    blurShare(on) {
      blur.setShare(on);
      return state();
    },
    blurState: state,
    pickStart() {
      stopPick();
      session = startPick({ doc, blur, selectors: picked });
      return state();
    },
    pickStop() {
      stopPick();
      return state();
    },
    tablesEnable: () => tables.enable(),
    tablesFilter(query) {
      let shown = 0;
      for (const t of tables.tables()) shown += tables.filter(t.table, query);
      return shown;
    },
    tablesRestoreOrder() {
      for (const t of tables.tables()) tables.restoreOrder(t.table);
    },
    restore() {
      stopPick();
      blur.restore();
      tables.restore();
      picked.length = 0;
    },
  };
}
