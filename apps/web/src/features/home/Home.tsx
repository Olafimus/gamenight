import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { userLabel } from "@scheisse/shared";
import logoIcon from "../../assets/brand/logo-icon.png";
import cards from "../../assets/cards.svg";
import binoculars from "../../assets/binoculars2.png";
import statistic from "../../assets/statistic.svg";
import { useAuth } from "../../lib/auth";
import { Button, ButtonLink, FadeIn, Stagger, StaggerItem, Tile, Tooltip, motion, springs, useReducedMotion, useToast } from "../../ui";
import { errorMessage } from "../../lib/api";
import { useInstall } from "../../lib/pwa";
import { hasRunningMatch } from "./useRunningMatch";
import styles from "./Home.module.css";

export function Home() {
  const { user, loading, logout } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const running = useMemo(() => hasRunningMatch(), []);
  const install = useInstall();
  const reduce = useReducedMotion();

  return (
    <div className={styles.shell}>
    <main className={styles.page}>
      <div className={styles.top}>
        {loading ? null : user ? (
          <>
            <Tooltip content="Konto: Anzeigename, Passwort, Gast-Statistik übernehmen" side="bottom">
              <Link to="/account" className={styles.user}>
                Angemeldet als <strong>{userLabel(user)}</strong>
              </Link>
            </Tooltip>
            <Button
              variant="ghost"
              size="sm"
              tooltip="Von diesem Gerät abmelden"
              onClick={() => logout().catch((e) => toast.show(errorMessage(e), { tone: "error" }))}
            >
              Abmelden
            </Button>
          </>
        ) : (
          <Tooltip content="Anmelden, damit deine Matches in der Bestenliste zählen." side="bottom">
            <ButtonLink to="/login" state={{ from: location.pathname }} variant="secondary" size="sm">
              Anmelden
            </ButtonLink>
          </Tooltip>
        )}
      </div>

      <header className={styles.hero}>
        <motion.div
          className={styles.iconWrap}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -40, rotateY: 90, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
          transition={reduce ? { duration: 0.15 } : { ...springs.bouncy, stiffness: 200, damping: 16, mass: 1 }}
        >
          <img src={logoIcon} alt="" className={styles.icon} width={96} height={96} />
        </motion.div>
        <FadeIn delay={0.25} y={12}>
          <h1 className={styles.wordmark}>Scheisse</h1>
        </FadeIn>
        <FadeIn delay={0.4} y={6} className={styles.subline}>
          <span className={styles.rule} aria-hidden="true" />
          <span className={styles.diamond} aria-hidden="true">◆</span>
          <span className={styles.sub}>Kartenspiel</span>
          <span className={styles.diamond} aria-hidden="true">◆</span>
          <span className={styles.rule} aria-hidden="true" />
        </FadeIn>
      </header>

      {running && (
        <div className={styles.banner}>
          <div className={styles.bannerText}>
            Laufendes Match fortsetzen
            <small>Auf diesem Gerät läuft noch ein Spiel.</small>
          </div>
          <ButtonLink to="/game" variant="primary">
            Fortsetzen
          </ButtonLink>
        </div>
      )}

      <Stagger as="nav" delay={0.45} gap={0.09} className={styles.tiles} aria-label="Hauptmenü">
        <StaggerItem y={24} className={styles.tileWrap}>
          <Tile to="/game" tooltip="Punkte zählen: Spieler wählen, Ansagen eintragen, Runde für Runde." title="Spielen" description="Neues Match starten und Punkte zählen" image={cards} contain />
        </StaggerItem>
        <StaggerItem y={24} className={styles.tileWrap}>
          <Tile to="/watch" tooltip="Mit dem Match-Code live zusehen, ohne mitzuspielen." title="Zuschauen" description="Ein laufendes Match live verfolgen" image={binoculars} />
        </StaggerItem>
        <StaggerItem y={24} className={styles.tileWrap}>
          <Tile to="/stats" tooltip="Bestenliste und Auswertungen aller gespielten Matches." title="Statistiken" description="Bestenliste, Matches und mehr" image={statistic} contain />
        </StaggerItem>
      </Stagger>
      {install.kind === "prompt" && (
        <div className={styles.install}>
          <Button variant="ghost" size="sm" tooltip="Scheisse wie eine App auf dem Gerät installieren – auch offline nutzbar." onClick={() => void install.install()}>
            App installieren
          </Button>
        </div>
      )}
      {install.kind === "ios" && (
        <Tooltip content="Im Safari-Teilen-Menü „Zum Home-Bildschirm“ wählen, dann startet Scheisse wie eine App.">
          <p className={styles.iosHint} tabIndex={0}>
            App installieren: Teilen → Zum Home-Bildschirm
          </p>
        </Tooltip>
      )}
      {install.kind === "android" &&
        (install.secure ? (
          <Tooltip content="Am besten in Chrome öffnen. Erscheint dort kein Menüpunkt, die Seite einmal neu laden.">
            <p className={styles.iosHint} tabIndex={0}>
              App installieren: Browser-Menü ⋮ → „App installieren“
            </p>
          </Tooltip>
        ) : (
          <Tooltip content="Browser erlauben das Installieren nur über eine sichere Verbindung (https://). Die Seite läuft gerade über http.">
            <p className={styles.iosHint} tabIndex={0}>
              Installation als App erst über HTTPS möglich
            </p>
          </Tooltip>
        ))}
    </main>
    </div>
  );
}
