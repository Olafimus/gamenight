import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { IoArrowBack } from "react-icons/io5";
import { GAMES, getGame, userLabel } from "@gamenight/shared";
import logoIcon from "../../assets/brand/logo-icon.png";
import cards from "../../assets/cards.svg";
import binoculars from "../../assets/binoculars2.png";
import statistic from "../../assets/statistic.svg";
import kniffelLogo from "../../assets/games/kniffel.png";
import wizardLogo from "../../assets/games/wizard.png";
import kniffelIcon from "../../assets/games/kniffel-icon.png";
import wizardIcon from "../../assets/games/wizard-icon.png";
import { useAuth } from "../../lib/auth";
import { Button, ButtonLink, FadeIn, Stagger, StaggerItem, Tile, Tooltip, motion, springs, useReducedMotion, useToast } from "../../ui";
import { errorMessage } from "../../lib/api";
import { useInstall } from "../../lib/pwa";
import { useSelectedGame, useSelectedGameStore } from "../../lib/games";
import { useGameStore } from "../game/store";
import { hasRunningMatch } from "./useRunningMatch";
import styles from "./Home.module.css";

/** Per game: tile artwork (logo on its own background colour), hero icon and accent colour of the menu. */
const GAME_ART: Record<string, { color: string; image?: string; icon: string; accent: string }> = {
  scheisse: { color: "#0f3d2e", icon: logoIcon, accent: "#7fc3ad" },
  wizard: { color: "#141b3d", image: wizardLogo, icon: wizardIcon, accent: "#e8c35c" },
  kniffel: { color: "#ff8a1f", image: kniffelLogo, icon: kniffelIcon, accent: "#ff8a1f" },
};

/** Top bar (account), hero and the "continue" banner shared by the start page and the menu. */
function HomeShell({
  subline,
  icon = logoIcon,
  accent,
  left,
  children,
}: {
  subline: string;
  icon?: string;
  /** Colour of the subline and the icon glow (the chosen game's colour). */
  accent?: string;
  left?: ReactNode;
  children: ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const running = useMemo(() => hasRunningMatch(), []);
  const reduce = useReducedMotion();

  return (
    <div className={styles.shell}>
      <main className={styles.page}>
        <div className={styles.top}>
          {left && <div className={styles.topLeft}>{left}</div>}
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

        <header className={styles.hero} style={accent ? ({ "--accent": accent } as CSSProperties) : undefined}>
          <motion.div
            className={styles.iconWrap}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -40, rotateY: 90, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
            transition={reduce ? { duration: 0.15 } : { ...springs.bouncy, stiffness: 200, damping: 16, mass: 1 }}
          >
            <img src={icon} alt="" className={styles.icon} width={96} height={96} />
          </motion.div>
          <FadeIn delay={0.25} y={12}>
            <h1 className={styles.wordmark}>Gamenight</h1>
          </FadeIn>
          <FadeIn delay={0.4} y={6} className={styles.subline}>
            <span className={styles.rule} aria-hidden="true" />
            <span className={styles.diamond} aria-hidden="true">◆</span>
            <span className={styles.sub}>{subline}</span>
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

        {children}
      </main>
    </div>
  );
}

/** Scheisse has no logo image yet: app icon + name in the same layout as the other logos. */
function ScheisseArt() {
  return (
    <span className={styles.scheisseArt}>
      <img src={logoIcon} alt="" />
      <span className={styles.scheisseName}>Scheisse</span>
      <span className={styles.scheisseSub}>Kartenspiel</span>
    </span>
  );
}

/** Start page: choose the game. Setup, statistics and rulesets then work with it (menu at /menu). */
export function GameSelect() {
  const install = useInstall();
  const choose = (id: string) => {
    useSelectedGameStore.getState().select(id);
    useGameStore.getState().setDraftGame(id);
  };

  return (
    <HomeShell subline="Spiel wählen">
      <Stagger as="nav" delay={0.45} gap={0.09} className={styles.tiles} aria-label="Spiel wählen">
        {GAMES.map((g) => {
          const art = GAME_ART[g.id];
          return (
            <StaggerItem key={g.id} y={24} className={styles.tileWrap}>
              <Tile
                to="/menu"
                onClick={() => choose(g.id)}
                title={g.name}
                description={g.tagline}
                color={art?.color}
                image={art?.image}
                contain
                plain
                art={art?.image ? undefined : <ScheisseArt />}
                hideTitle
              />
            </StaggerItem>
          );
        })}
      </Stagger>
      {install.kind === "prompt" && (
        <div className={styles.install}>
          <Button variant="ghost" size="sm" tooltip="Gamenight wie eine App auf dem Gerät installieren – auch offline nutzbar." onClick={() => void install.install()}>
            App installieren
          </Button>
        </div>
      )}
      {install.kind === "ios" && (
        <Tooltip content="Im Safari-Teilen-Menü „Zum Home-Bildschirm“ wählen, dann startet Gamenight wie eine App.">
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
    </HomeShell>
  );
}

/** Menu of the chosen game: play, watch, statistics. */
export function Home() {
  const gameId = useSelectedGame();
  const name = getGame(gameId)?.name ?? "";
  const art = GAME_ART[gameId];

  return (
    <HomeShell
      subline={name}
      icon={art?.icon}
      accent={art?.accent}
      left={
        <Link to="/" className={styles.switch}>
          <IoArrowBack aria-hidden="true" /> Spiel wechseln
        </Link>
      }
    >
      <Stagger as="nav" delay={0.45} gap={0.09} className={styles.tiles} aria-label="Hauptmenü">
        <StaggerItem y={24} className={styles.tileWrap}>
          <Tile to="/game" tooltip="Punkte zählen: Spieler wählen, Ansagen eintragen, Runde für Runde." title="Spielen" description={`Neues Match ${name} starten und Punkte zählen`} image={cards} contain />
        </StaggerItem>
        <StaggerItem y={24} className={styles.tileWrap}>
          <Tile to="/watch" tooltip="Mit dem Match-Code live zusehen, ohne mitzuspielen." title="Zuschauen" description="Ein laufendes Match live verfolgen" image={binoculars} />
        </StaggerItem>
        <StaggerItem y={24} className={styles.tileWrap}>
          <Tile to="/stats" tooltip="Bestenliste und Auswertungen aller gespielten Matches." title="Statistiken" description={`Bestenliste und Matches – ${name}`} image={statistic} contain />
        </StaggerItem>
      </Stagger>
    </HomeShell>
  );
}
