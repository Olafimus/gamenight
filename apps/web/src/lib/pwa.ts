import { useCallback, useEffect, useState } from "react";

/** Tracks navigator.onLine. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
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

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return mm || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIosSafari(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function isAndroid(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return /Android/i.test(ua);
}

export type InstallState =
  | { kind: "none" }
  | { kind: "prompt"; install: () => Promise<void> }
  | { kind: "ios" }
  /** Android without a captured prompt: point to the browser menu (secure=false: plain http, Chrome cannot install). */
  | { kind: "android"; secure: boolean };

// `beforeinstallprompt` fires once, early, and on whatever page the app was opened on. Capture it at module
// load (imported from main.tsx) instead of in the Home component, otherwise it is usually missed.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedFlag = false;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installedFlag = true;
    notifyInstall();
  });
}

/** What the home page should offer for installation. */
export function useInstall(): InstallState {
  const [, rerender] = useState(0);

  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    installListeners.add(l);
    return () => void installListeners.delete(l);
  }, []);

  const install = useCallback(async () => {
    const evt = deferredPrompt;
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice.catch(() => undefined);
    deferredPrompt = null;
    notifyInstall();
  }, []);

  if (installedFlag || isStandalone()) return { kind: "none" };
  if (deferredPrompt) return { kind: "prompt", install };
  if (isIosSafari()) return { kind: "ios" };
  if (isAndroid()) return { kind: "android", secure: window.isSecureContext };
  return { kind: "none" };
}
