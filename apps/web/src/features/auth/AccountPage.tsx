import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { userLabel, type ClaimGuestResponse } from "@gamenight/shared";
import { ApiRequestError, apiPost, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Button, PageHeader, Spinner, TextInput, useToast } from "../../ui";
import { MAX_NAME_LENGTH } from "../game/store";
import styles from "./AuthPage.module.css";

/** Simple account settings: display name, password, take over guest statistics, logout. */
export function AccountPage() {
  const { user, loading, updateProfile, changePassword, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => setDisplayName(user?.displayName ?? ""), [user?.displayName]);

  if (loading) return <Spinner centered />;
  if (!user) return <Navigate to="/login" state={{ from: "/account" }} replace />;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    try {
      await updateProfile({ displayName: displayName.trim() || null });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.show("Anzeigename gespeichert.", { tone: "success" });
    } catch (err) {
      toast.show(errorMessage(err), { tone: "error" });
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) return setPwError("Das neue Passwort muss mindestens 6 Zeichen lang sein.");
    setPwError(null);
    setSavingPw(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast.show("Passwort geändert.", { tone: "success" });
    } catch (err) {
      setPwError(err instanceof ApiRequestError && err.code === "invalid_credentials" ? "Das aktuelle Passwort ist falsch." : errorMessage(err));
    } finally {
      setSavingPw(false);
    }
  };

  const claim = async (e: FormEvent) => {
    e.preventDefault();
    setClaimError(null);
    setClaiming(true);
    try {
      const r = await apiPost<ClaimGuestResponse>("/auth/claim-guest", { name: guestName.trim() });
      setGuestName("");
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.show(`${r.claimedMatches} ${r.claimedMatches === 1 ? "Match" : "Matches"} übernommen.`, { tone: "success" });
    } catch (err) {
      setClaimError(err instanceof ApiRequestError && err.status === 404 ? "Kein Gast mit diesem Namen gefunden." : errorMessage(err));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <>
      <PageHeader title="Konto" back="/" />
      <main className={styles.page}>
        <div className={styles.stack}>
          <section className={styles.card}>
            <h2 className={styles.title}>{userLabel(user)}</h2>
            <p className={styles.note}>
              Benutzername: <strong>{user.username}</strong> · <Link to={`/stats/players/${user.id}`}>Meine Statistik</Link>
            </p>
            <form className={styles.form} onSubmit={saveName}>
              <TextInput
                label="Anzeigename"
                value={displayName}
                maxLength={MAX_NAME_LENGTH}
                placeholder={user.username}
                onChange={(e) => setDisplayName(e.target.value)}
                hint="Leer lassen, um den Benutzernamen anzuzeigen."
                info="Wird am Tisch und in der Bestenliste statt des Benutzernamens angezeigt. Anmelden kannst du dich weiterhin nur mit dem Benutzernamen."
                autoComplete="nickname"
              />
              <Button type="submit" loading={savingName} disabled={displayName.trim() === (user.displayName ?? "")}>
                Speichern
              </Button>
            </form>
          </section>

          <section className={styles.card}>
            <h2 className={styles.subtitle}>Gast-Statistik übernehmen</h2>
            <p className={styles.note}>Du hast früher als Gast gespielt? Die beendeten Matches dieses Gasts werden deinem Konto zugeordnet.</p>
            <form className={styles.form} onSubmit={claim}>
              {claimError && (
                <div className={styles.error} role="alert">
                  {claimError}
                </div>
              )}
              <TextInput label="Gastname" value={guestName} maxLength={MAX_NAME_LENGTH} onChange={(e) => setGuestName(e.target.value)} autoComplete="off" />
              <Button type="submit" variant="secondary" loading={claiming} disabled={!guestName.trim()}>
                Übernehmen
              </Button>
            </form>
          </section>

          <section className={styles.card}>
            <h2 className={styles.subtitle}>Passwort ändern</h2>
            <form className={styles.form} onSubmit={savePassword}>
              {pwError && (
                <div className={styles.error} role="alert">
                  {pwError}
                </div>
              )}
              <input type="text" name="username" autoComplete="username" value={user.username} readOnly hidden />
              <TextInput label="Aktuelles Passwort" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              <TextInput label="Neues Passwort" type="password" autoComplete="new-password" hint="Mindestens 6 Zeichen" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <Button type="submit" variant="secondary" loading={savingPw} disabled={!currentPassword || !newPassword}>
                Passwort ändern
              </Button>
            </form>
          </section>

          <Button
            variant="ghost"
            block
            onClick={() =>
              logout()
                .then(() => navigate("/"))
                .catch((e) => toast.show(errorMessage(e), { tone: "error" }))
            }
          >
            Abmelden
          </Button>
        </div>
      </main>
    </>
  );
}
