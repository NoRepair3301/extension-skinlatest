/**
 * Debug logging, off by default. It accepts only short event names and codes: there is no way to pass a payload,
 * a plan, a page value or a key, so none can be logged.
 */
let enabled = false;

export const setDebug = (on: boolean): void => {
  enabled = on;
};

export const debug = (event: string, code?: string | number): void => {
  if (!enabled) return;
  console.debug(`[skinly] ${event.slice(0, 60)}${code === undefined ? "" : ` ${String(code).slice(0, 40)}`}`);
};
