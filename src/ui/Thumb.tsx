import { useEffect, useRef } from "preact/hooks";

interface Props {
  /** Draws the picture with the same builder the page uses. Called once per mount. */
  draw(doc: Document): Element | undefined;
}

/** A small drawing inside a box. The builder returns an SVG made with createElementNS; nothing is parsed from text. */
export function Thumb({ draw }: Props) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    try {
      const node = draw(el.ownerDocument);
      if (node) el.replaceChildren(node);
    } catch {
      el.replaceChildren();
    }
  }, []);
  return <span class="thumb" ref={box} aria-hidden="true" />;
}
