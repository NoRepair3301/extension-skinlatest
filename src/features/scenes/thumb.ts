import { getScene } from "./index.ts";
import type { SceneId } from "./types.ts";

/** Ids inside one document must be unique, and the pickers draw several thumbnails into the same popup. */
let seq = 0;

/** One scene as a small picture: its most characteristic actor, drawn by the same builder the page uses. */
export function sceneThumb(doc: Document, id: SceneId, accent: string): Element | undefined {
  const def = getScene(id);
  if (!def) return undefined;
  const actor = def.actors.find((a) => !a.back && a.id !== "camo-patch") ?? def.actors[0];
  if (!actor) return undefined;
  return actor.build({ doc, accent, uid: (name) => `${name}t${++seq}` });
}
