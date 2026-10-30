import { useEffect, useState } from "preact/hooks";

/** Pure. navigator.onLine, treating a missing or throwing navigator as online (the browser decides at the request). */
export function isOnline(nav: { onLine?: boolean } | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  try {
    return nav?.onLine !== false;
  } catch {
    return true;
  }
}

/** True while the browser says it is online; follows the online and offline events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline());
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
