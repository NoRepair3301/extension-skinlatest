export interface ObserverOptions {
  debounceMs?: number;
  maxPerMinute?: number;
  now?: () => number;
}

export interface BoundedObserver {
  disconnect(): void;
}

/** Watches childList changes only. A burst gives one check after the debounce; at most `maxPerMinute` checks per rolling minute. */
export function createBoundedObserver(doc: Document, root: Element, onCheck: () => void, opts: ObserverOptions = {}): BoundedObserver {
  const debounceMs = opts.debounceMs ?? 300;
  const maxPerMinute = opts.maxPerMinute ?? 5;
  const now = opts.now ?? (() => Date.now());
  const win = doc.defaultView;
  if (!win) return { disconnect() {} };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stamps: number[] = [];
  let live = true;

  const fire = () => {
    timer = undefined;
    if (!live) return;
    const t = now();
    stamps = stamps.filter((s) => t - s < 60_000);
    if (stamps.length >= maxPerMinute) return;
    stamps.push(t);
    onCheck();
  };

  const mo = new win.MutationObserver(() => {
    if (!live) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fire, debounceMs);
  });
  mo.observe(root, { childList: true, subtree: true });

  return {
    disconnect() {
      live = false;
      mo.disconnect();
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
