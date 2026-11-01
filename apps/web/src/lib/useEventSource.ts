import { useEffect, useRef, useState } from "react";

export type EventSourceStatus = "connecting" | "open" | "error";

export interface UseEventSourceOptions {
  /** Names of the SSE events to listen for (e.g. ["match", "deleted"]). Unnamed messages are always delivered as "message". */
  events: string[];
  /** Called for each event with its raw `data` string (JSON.parse it yourself). */
  onEvent: (type: string, data: string) => void;
  /** Max reconnect delay in ms (default 15000). */
  maxRetryMs?: number;
}

/** The server sends a "ping" event every 15 s; without any traffic for this long the connection counts as dead. */
export const STALE_MS = 35_000;
/** Hidden for at least this long (screen off, app in background): reconnect right away when visible again. */
export const RESUME_MS = 1_000;

/**
 * Reconnecting EventSource. Pass `null` as url to stay disconnected.
 * status: "connecting" (initial / reconnecting), "open", "error" (connection lost, retrying).
 *
 * Phones silently drop the connection while the screen is off, and the browser only notices much later.
 * So the source is rebuilt immediately when the page becomes visible again, comes back online or is restored
 * from the bfcache, and whenever no event (incl. server pings) arrived for STALE_MS. Every reconnect makes
 * the server send the current state again.
 */
export function useEventSource(url: string | null, options: UseEventSourceOptions): { status: EventSourceStatus } {
  const [status, setStatus] = useState<EventSourceStatus>("connecting");
  const optsRef = useRef(options);
  optsRef.current = options;
  const eventsKey = options.events.join("|");

  useEffect(() => {
    if (!url) return;
    let es: EventSource | null = null;
    let timer: number | undefined;
    let attempt = 0;
    let disposed = false;
    let lastSeen = Date.now();
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : null;

    const seen = () => {
      lastSeen = Date.now();
    };

    const connect = () => {
      if (disposed) return;
      window.clearTimeout(timer);
      es?.close();
      setStatus("connecting");
      seen();
      const source = new EventSource(url, { withCredentials: true });
      es = source;
      source.onopen = () => {
        attempt = 0;
        seen();
        setStatus("open");
      };
      source.onmessage = (e) => {
        seen();
        optsRef.current.onEvent("message", e.data);
      };
      source.addEventListener("ping", seen);
      for (const name of eventsKey.split("|").filter(Boolean)) {
        source.addEventListener(name, (e) => {
          seen();
          optsRef.current.onEvent(name, (e as MessageEvent<string>).data);
        });
      }
      source.onerror = () => {
        if (es !== source) return;
        setStatus("error");
        // Browsers retry on their own while CONNECTING; if the source got closed, reconnect with backoff.
        if (source.readyState === EventSource.CLOSED) {
          source.close();
          const max = optsRef.current.maxRetryMs ?? 15_000;
          const delay = Math.min(max, 1000 * 2 ** attempt++);
          timer = window.setTimeout(connect, delay);
        }
      };
    };

    /** Reconnect now (skipping any backoff) – the old connection may look open but be dead. */
    const reconnectNow = () => {
      if (disposed) return;
      attempt = 0;
      connect();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= RESUME_MS || es?.readyState !== EventSource.OPEN || Date.now() - lastSeen > STALE_MS) reconnectNow();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reconnectNow();
    };
    const watchdog = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastSeen > STALE_MS) reconnectNow();
    }, 5_000);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", reconnectNow);
    window.addEventListener("pageshow", onPageShow);
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", reconnectNow);
      window.removeEventListener("pageshow", onPageShow);
      es?.close();
    };
  }, [url, eventsKey]);

  return { status: url ? status : "connecting" };
}
