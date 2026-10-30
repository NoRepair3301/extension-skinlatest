/**
 * In-memory diagnostics for one script instance: short fixed kinds and numbers only. There is no way to pass page text, a URL,
 * an origin, a key or a field value, because every entry is one of the fixed kinds below (anything else is stored as "other").
 * Persisted by src/extension/diagStore.ts (storage.local key `diag`, a ring of the last DIAG_MAX kinds).
 */
export const DIAG_KINDS = [
  "scene-mount",
  "scene-render",
  "scene-measure",
  "scene-reattach",
  "pet-mount",
  "pet-reattach",
  "asset-mount",
  "asset-reattach",
  "no-adopted-sheets",
  "auto-run",
  "auto-art",
  "auto-pet",
  "apply-error",
  "repair-error",
  "provider-error",
  "popup-error",
  "unhandled",
  "other",
] as const;
export type DiagKind = (typeof DIAG_KINDS)[number];
export const DIAG_MAX = 20;

/**
 * A2: what the auto script did on this document, as one fixed word (the popup adds the states it can see itself: no record, no
 * permission, not registered). Never a URL, origin or text.
 */
export const AUTO_STATES = [
  "not-run",
  "no-record",
  "no-permission",
  "not-registered",
  "paused",
  "blocked",
  "applied",
  "rolled-back-invalid-plan",
  "rolled-back-too-large",
  "rolled-back-invariants",
  "rolled-back-error",
  "error-storage",
  "error-apply",
  "error-other",
] as const;
export type AutoState = (typeof AUTO_STATES)[number];
export const isAutoState = (v: unknown): v is AutoState => typeof v === "string" && (AUTO_STATES as readonly string[]).includes(v);

/** Which mount point the art uses and why: the html element, or the body because html has an effect that breaks position fixed. */
export type MountReason = "transform" | "filter" | "perspective" | "contain";

export interface DiagFlags {
  /** b: constructable stylesheets worked inside our shadow roots (false: the browser has none, the art is unstyled). */
  sheets?: boolean;
  /** c: where the art host lives. */
  mount?: "html" | "body";
  /** c: why the art moved to the body (html had this effect). */
  htmlEffect?: MountReason;
  /** c: times a host was put back after the page removed it. */
  reattached: number;
  /** A2: the auto script's state word for this document. */
  auto?: AutoState;
}

const ring: DiagKind[] = [];
/** Errors recorded since the script started, and how many of them were already handed to the store (takeErrors). */
let total = 0;
let taken = 0;
const flags: DiagFlags = { reattached: 0 };
const listeners = new Set<() => void>();

const isKind = (k: string): k is DiagKind => (DIAG_KINDS as readonly string[]).includes(k);

const notify = () => {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // a listener never breaks the recorder
    }
  }
};

/** Records one caught error as its short kind. Never throws. */
export function recordError(kind: DiagKind): void {
  ring.push(isKind(kind) ? kind : "other");
  total++;
  if (ring.length > DIAG_MAX) ring.splice(0, ring.length - DIAG_MAX);
  notify();
}

export function setFlag<K extends keyof DiagFlags>(name: K, value: DiagFlags[K]): void {
  if (flags[name] === value) return;
  flags[name] = value;
  notify();
}

export const countReattach = (): void => setFlag("reattached", flags.reattached + 1);

/** Runs `fn`; an exception is recorded as `kind` and `fallback` is returned. Nothing is ever thrown into the page. */
export function guarded<T>(kind: DiagKind, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    recordError(kind);
    return fallback;
  }
}

export const diagErrors = (): DiagKind[] => ring.slice();

/** The errors recorded since the last call (at most DIAG_MAX), so each one is persisted once. */
export function takeErrors(): DiagKind[] {
  const fresh = Math.min(total - taken, ring.length);
  taken = total;
  return fresh > 0 ? ring.slice(-fresh) : [];
}
export const diagFlags = (): DiagFlags => ({ ...flags });

/** Subscribe to any change; returns the unsubscribe. */
export function onDiag(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Pure: keeps only known kinds, newest last, at most DIAG_MAX. Used for anything read back from storage. */
export function parseKinds(raw: unknown): DiagKind[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is DiagKind => typeof k === "string" && isKind(k)).slice(-DIAG_MAX);
}

/** For tests. */
export function resetDiag(): void {
  ring.length = 0;
  total = 0;
  taken = 0;
  for (const k of Object.keys(flags) as Array<keyof DiagFlags>) delete flags[k];
  flags.reattached = 0;
  notify();
}
