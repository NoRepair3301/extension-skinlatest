import { drawPet, type PetKind, type PetPose } from "./art.ts";

export type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type Size = "small" | "medium" | "large";

export const SIZE_PX: Record<Size, number> = { small: 48, medium: 72, large: 96 };
export const MARGIN_PX = 12;
/** High, but below the 2^31-1 maximum so a page can still put its own thing on top. */
export const Z_INDEX = 2147483000;

export interface OverlayOptions {
  kind: PetKind;
  /** Theme accent (#rrggbb) for the scarf or bow; optional. */
  accent?: string | undefined;
  size: Size;
  corner: Corner;
  onHide(): void;
  onPetClick(): void;
}

export interface Overlay {
  host: HTMLElement;
  setPose(pose: PetPose): void;
  setCorner(corner: Corner): void;
  /** Walking: puts the pet at x,y (viewport px, top-left) facing left (-1) or right (1). */
  setPlace(x: number, y: number, facing: 1 | -1): void;
  /** While walking the pet and its button ignore the pointer. */
  setWalking(on: boolean): void;
  focusPet(): void;
  destroy(): void;
}

const CSS =
  ":host{all:initial}" +
  ".wrap{position:relative;width:100%;height:100%;pointer-events:none}" +
  "button{font:inherit;padding:0;margin:0;border:0;background:none;cursor:pointer}" +
  ".pet{position:absolute;inset:0;pointer-events:auto;border-radius:50%;animation:bob 2.6s ease-in-out infinite alternate}" +
  ".pet svg{display:block;width:100%;height:100%}" +
  '.wrap[data-facing="-1"] .pet svg{transform:scaleX(-1)}' +
  ".pet:focus-visible,.hide:focus-visible{outline:2px solid #1d4ed8;outline-offset:2px}" +
  // the close button is invisible until the pointer is over the pet or the keyboard focus reaches it
  ".hide{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;pointer-events:auto;background:#1f2933;color:#fff;font:700 12px/20px system-ui,sans-serif;text-align:center;opacity:0;transition:opacity .15s}" +
  ".wrap:hover .hide,.wrap:focus-within .hide{opacity:.9}" +
  ".walking .pet,.walking .hide{pointer-events:none;animation:none}" +
  "@keyframes bob{from{transform:translateY(0)}to{transform:translateY(-2px)}}" +
  "@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}";

function place(host: HTMLElement, corner: Corner, size: Size): void {
  const px = SIZE_PX[size];
  const s = host.style;
  s.cssText = "";
  s.setProperty("all", "initial");
  s.setProperty("position", "fixed");
  s.setProperty("pointer-events", "none");
  s.setProperty("z-index", String(Z_INDEX));
  s.setProperty("width", `${px}px`);
  s.setProperty("height", `${px}px`);
  s.setProperty(corner.startsWith("top") ? "top" : "bottom", `${MARGIN_PX}px`);
  s.setProperty(corner.endsWith("right") ? "right" : "left", `${MARGIN_PX}px`);
}

/** One fixed host with a shadow root. The host ignores the pointer; only the pet body and the hide button receive it. */
export function createOverlay(doc: Document, opts: OverlayOptions): Overlay {
  const host = doc.createElement("div");
  host.setAttribute("data-skinly-ui", "pet");
  place(host, opts.corner, opts.size);
  const root = host.attachShadow({ mode: "open" });

  const style = doc.createElement("style");
  style.textContent = CSS;
  const wrap = doc.createElement("div");
  wrap.className = "wrap";

  const pet = doc.createElement("button");
  pet.type = "button";
  pet.className = "pet";
  pet.setAttribute("aria-label", "Pet. Press Escape to hide it.");
  pet.addEventListener("click", () => opts.onPetClick());

  const hide = doc.createElement("button");
  hide.type = "button";
  hide.className = "hide";
  hide.setAttribute("aria-label", "Hide pet");
  hide.textContent = "×";
  hide.addEventListener("click", () => opts.onHide());

  const onKey = (e: Event) => {
    if ((e as KeyboardEvent).key === "Escape") opts.onHide();
  };
  wrap.addEventListener("keydown", onKey);

  const setPose = (pose: PetPose) => pet.replaceChildren(drawPet(doc, opts.kind, pose, opts.accent));
  setPose("idle");

  wrap.append(pet, hide);
  root.append(style, wrap);
  doc.documentElement.append(host);

  return {
    host,
    setPose,
    setCorner(corner) {
      opts.corner = corner;
      place(host, corner, opts.size);
      wrap.removeAttribute("data-facing");
    },
    setPlace(x, y, facing) {
      const st = host.style;
      st.setProperty("left", "0");
      st.setProperty("top", "0");
      st.setProperty("right", "auto");
      st.setProperty("bottom", "auto");
      st.setProperty("transform", `translate(${Math.round(x)}px,${Math.round(y)}px)`);
      wrap.setAttribute("data-facing", String(facing));
    },
    setWalking(on) {
      wrap.classList.toggle("walking", on);
    },
    focusPet: () => pet.focus(),
    destroy: () => host.remove(),
  };
}
