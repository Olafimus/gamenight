import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { credentialsSchema } from "@gamenight/shared";
import { ApiRequestError, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button, ConfirmDialog, PageHeader, TextInput } from "../../ui";
import styles from "./AuthPage.module.css";

type Mode = "login" | "register";

function useRedirectTarget(): string {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("/login") && !from.startsWith("/register") ? from : "/";
}

/** Guest name from a 409 username_guest_taken (register offers to take that guest over), else null. */
export function guestTakenName(err: unknown): string | null {
  if (!(err instanceof ApiRequestError) || err.code !== "username_guest_taken") return null;
  const name = (err.body as { guestName?: unknown } | undefined)?.guestName;
  return typeof name === "string" && name ? name : null;
}

/** German message for a failed login/register request. */
export function authErrorMessage(err: unknown, mode: Mode): string {
  if (err instanceof ApiRequestError) {
    if (err.code === "username_taken") return "Dieser Benutzername ist schon vergeben.";
    if (err.code === "username_guest_taken") return "Dieser Name wird schon von einem Gastspieler verwendet.";
    if (err.code === "invalid_credentials") return "Benutzername oder Passwort ist falsch.";
    if (err.code === "validation") {
      return mode === "register"
        ? "Benutzername (3–30 Zeichen: Buchstaben, Zahlen, _ . -) oder Passwort (mind. 6 Zeichen) ist ungültig."
        : "Bitte gib Benutzername und Passwort ein.";
    }
  }
  return errorMessage(err);
}

export function AuthPage({ mode }: { mode: Mode }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const target = useRedirectTarget();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Guest whose name the new username matches: ask before taking it over. */
  const [guestName, setGuestName] = useState<string | null>(null);

  const isRegister = mode === "register";

  if (user && !busy) return <Navigate to={target} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = credentialsSchema.safeParse({ username, password });
    if (isRegister && !parsed.success) {
      const errs: { username?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === "password" ? "password" : "username";
        errs[key] ??=
          key === "password"
            ? "Das Passwort muss mindestens 6 Zeichen lang sein."
            : issue.code === "invalid_string"
              ? "Nur Buchstaben, Zahlen, _ . - erlaubt."
              : "Der Benutzername muss 3 bis 30 Zeichen lang sein.";
      }
      setFieldErrors(errs);
      return;
    }
    if (!isRegister && (!username.trim() || !password)) {
      setFieldErrors({
        ...(!username.trim() ? { username: "Bitte Benutzernamen eingeben." } : {}),
        ...(!password ? { password: "Bitte Passwort eingeben." } : {}),
      });
      return;
    }
    setFieldErrors({});
    await submit(false);
  };

  const submit = async (claimGuest: boolean) => {
    setBusy(true);
    try {
      const creds = { username: username.trim(), password };
      await (isRegister ? register({ ...creds, ...(claimGuest ? { claimGuest } : {}) }) : login(creds));
      navigate(target, { replace: true });
    } catch (err) {
      const guest = isRegister && !claimGuest ? guestTakenName(err) : null;
      if (guest) setGuestName(guest);
      else setError(authErrorMessage(err, mode));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={isRegister ? "Registrieren" : "Anmelden"} back="/" />
      <main className={styles.page}>
        <div className={styles.card}>
          <h2 className={styles.title}>{isRegister ? "Konto erstellen" : "Willkommen zurück"}</h2>
          <p className={styles.note}>Ohne Konto spielen geht auch – dann zählen deine Matches nicht in der Bestenliste.</p>
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            <TextInput
              label="Benutzername"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={fieldErrors.username ?? null}
              hint={isRegister ? "3–30 Zeichen: Buchstaben, Zahlen, _ . -" : undefined}
              info={isRegister ? "Dein Benutzername ist öffentlich in der Bestenliste sichtbar. Erlaubt sind 3 bis 30 Zeichen: Buchstaben, Zahlen sowie _ . - (keine Leerzeichen)." : undefined}
              autoFocus
            />
            <TextInput
              label="Passwort"
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password ?? null}
              hint={isRegister ? "Mindestens 6 Zeichen" : undefined}
              info={isRegister ? "Mindestens 6 Zeichen. Wähle ein Passwort, das du sonst nirgends verwendest." : undefined}
            />
            <Button type="submit" size="lg" block loading={busy}>
              {isRegister ? "Registrieren" : "Anmelden"}
            </Button>
          </form>
          <p className={styles.switch}>
            {isRegister ? (
              <>
                Schon ein Konto?{" "}
                <Link to="/login" state={location.state}>
                  Anmelden
                </Link>
              </>
            ) : (
              <>
                Noch kein Konto?{" "}
                <Link to="/register" state={location.state}>
                  Registrieren
                </Link>
              </>
            )}
          </p>
        </div>
      </main>
      <ConfirmDialog
        open={guestName !== null}
        title="Gast übernehmen?"
        message={
          <>
            <p>
              Den Account des Gasts <strong>„{guestName}“</strong> übernehmen?
            </p>
            <p>Sein Name wird zu deinem Benutzernamen und seine beendeten Matches zählen ab sofort für dein Konto (Bestenliste und Statistik).</p>
          </>
        }
        confirmLabel="Übernehmen"
        cancelLabel="Anderer Name"
        onCancel={() => setGuestName(null)}
        onConfirm={() => {
          setGuestName(null);
          void submit(true);
        }}
      />
    </>
  );
}
