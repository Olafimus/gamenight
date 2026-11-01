import { useEffect } from "react";

interface Sentinel {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", cb: () => void) => void;
}
type WakeLockNav = Navigator & { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } };

export const wakeLockSupported = (): boolean => typeof navigator !== "undefined" && !!(navigator as WakeLockNav).wakeLock;

/**
 * Keeps the screen on while `active` and the page is visible. Re-acquires the lock when the page becomes
 * visible again (browsers release it on hide). No-op where the Wake Lock API is missing.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !wakeLockSupported()) return;
    let sentinel: Sentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      try {
        const s = await (navigator as WakeLockNav).wakeLock!.request("screen");
        if (cancelled) {
          void s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        s.addEventListener?.("release", () => {
          if (sentinel === s) sentinel = null;
        });
      } catch {
        /* denied (e.g. low battery) – keep playing */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      const s = sentinel;
      sentinel = null;
      if (s) void s.release().catch(() => undefined);
    };
  }, [active]);
}
