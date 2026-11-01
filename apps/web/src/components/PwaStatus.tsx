import { useRegisterSW } from "virtual:pwa-register/react";
import { useOnline } from "../lib/pwa";
import { Tooltip } from "../ui";
import styles from "./PwaStatus.module.css";

/** Subtle app-wide banner shown while the device is offline. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <Tooltip content="Ohne Internet kannst du weiterspielen. Zuschauen und Anmelden gehen erst wieder mit Verbindung." side="bottom">
      <div className={styles.offline} role="status" tabIndex={0}>
        Offline – keine Verbindung zum Server.
      </div>
    </Tooltip>
  );
}

/** "Update verfügbar" toast driven by the service worker. */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) window.setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className={styles.update} role="alert">
      <span>Update verfügbar</span>
      <Tooltip content="Neue Version jetzt laden. Laufende Spiele bleiben erhalten.">
        <button type="button" className={styles.reload} onClick={() => void updateServiceWorker(true)}>
          Neu laden
        </button>
      </Tooltip>
      <Tooltip content="Später erinnern – Update bleibt bereit">
        <button type="button" className={styles.dismiss} aria-label="Schließen" onClick={() => setNeedRefresh(false)}>
          ×
        </button>
      </Tooltip>
    </div>
  );
}

export function PwaStatus() {
  return (
    <>
      <OfflineBanner />
      <UpdateToast />
    </>
  );
}
