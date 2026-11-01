# Web-Core API (für Feature-Agents)

Styling: CSS Modules (`*.module.css`), kein Sass. Tests: `src/**/*.test.{ts,tsx}`, jsdom + jest-dom (`src/test-setup.ts`). Routen sind Kinder der Layout-Route; jede Seite rendert ihren eigenen `<PageHeader>`.

## `src/ui` (Barrel `src/ui/index.ts`)
- `Button` – variant primary|secondary|danger|ghost|success, size sm|md|lg, `block`, `loading`, `tooltip?: string`. `ButtonLink` = Button + Link-Props (`to`).
- `IconButton` – `label` (Pflicht, zeigt automatisch als Tooltip), size, tone default|solid|danger, `tooltip?: string | false` (Override / `false` = kein Tooltip)
- `Modal` – open, onClose, title, footer, wide, dismissible (Fokusfalle, ESC, Backdrop; fokussiert `[data-autofocus]`)
- `ConfirmDialog` – open, title, message, confirmLabel, cancelLabel, destructive, onConfirm, onCancel
- `Dropdown` – `trigger({open, triggerProps})` (triggerProps auf den Button spreaden), `items[{key,label,icon,onSelect,danger,disabled,selected,separatorBefore}]`, align, direction
- `Tile` – to, title, description, image, contain, `tooltip?`
- `SkewRow` – tone default|alt|gold|green|teal, direction, as div|li, interactive
- `NumberInput` – `value: number|null`, onChange, min, max, step, label (Pflicht), placeholder, disabled, dark, compact (Stepper „<label> erhöhen/verringern“, Tooltips „Erhöhen/Verringern“)
- `CheckToggle` – `value: boolean|undefined`, onChange, label, disabled, compact (✓/✗, aria-pressed, Tooltips „Richtig/Falsch“)
- `Segmented<T>` – options[{value,label,disabled,tooltip?}], value, onChange, ariaLabel, variant pill|chips, full
- `PageHeader` – title, back (Pfad oder `true` = history back), actions; sticky, Logo als Home-Link
- `Tooltip` – `<Tooltip content={ReactNode} side?="top|bottom|left|right" delay?={400} trigger?="hover|click">{ein Kind-Element}</Tooltip>`. Kind muss ref + DOM-Events annehmen (button, a, span …; für nicht fokussierbare Elemente `tabIndex={0}` setzen). Hover (nach delay) + Tastaturfokus, ESC schließt; Touch: Long-Press (450 ms), schließt bei Tap außerhalb/Scroll; normale Taps bleiben unberührt (ein Klick nach erfolgreichem Long-Press wird unterdrückt). Portal, flip/shift im Viewport. Leerer `content` deaktiviert ihn. Eingebaut in IconButton/CheckToggle/NumberInput/PageHeader/Scoreboard – dort nicht doppelt wrappen.
- `InfoTip` – `<InfoTip content label?="Mehr Informationen" side? />`: kleines (i)-Icon (44 px Touch-Fläche), öffnet per Tap/Klick/Hover/Fokus. Für Kennzahlen-/Spalten-Erklärungen, z. B. neben `<th>`-Text.
- `Spinner` (size, centered), `EmptyState` (title,text,icon,action), `ErrorState` (title,message,onRetry)
- `RelativeTime` (date), `formatRelative(date, now?)`
- `useToast().show(msg, {tone:"info"|"success"|"error", duration})`
- `TextInput` – label, hint, error, hideLabel, `info?: ReactNode` (InfoTip neben dem Label) + Input-Props; `cx(...)` Klassen-Helfer

## `src/lib`
- `api.ts`: `apiGet/apiPost/apiPut/apiDelete(path ohne /api, body?, {headers, signal}?)`, credentials include, 204 → undefined. Fehler `ApiRequestError {status, code, body}`; Netzwerkfehler: status 0, code "network". `errorMessage(err)` → deutscher Text. Write-Token: `{headers: {"X-Write-Token": token}}`.
- `auth.tsx`: `useAuth()` → `{user, loading, login, register, logout}`
- `useEventSource(url|null, {events: string[], onEvent(type, rawData), maxRetryMs?})` → `{status: "connecting"|"open"|"error"}`. Benannte Events MÜSSEN in `events` gelistet werden (z. B. `["match","deleted"]`). Reconnect mit Backoff.
- `localHistory.ts`: `useLocalHistory` (zustand persist, Key `scheisse.history.v1`): `knownPlayers`, `playedMatches`, `addKnownPlayer`, `addPlayedMatch` (ersetzt gleiche matchId), `clear`; Typen `LocalMatchRecord`, `KnownPlayer`.
- `features/home/useRunningMatch.ts`: `GAME_STORAGE_KEY = "scheisse.game.v1"`, `hasRunningMatch()`. **Der Game-Store muss unter diesem Key im zustand-persist-Format `{state, version}` speichern; `state` = null, wenn kein Match läuft.** (Konkret: der persistierte Teil des Stores ist ein Objekt mit Feld `state: MatchState | null` plus Sync-Metadaten.)

## `src/components/Scoreboard.tsx`
Props `{match: DerivedMatch, correctionMode?, onCellClick?(roundIndex0, playerId)}`. Zelle „Ansage ┊ Summe“, Medaillenfarben; im Korrekturmodus richtig/falsch-Farben + ✓/✗ + oranger Rahmen, klickbar nur mit onCellClick. Horizontal scrollbar, sticky erste Spalte. `data-testid="cell-{r}-{playerId}"`.
Zellen, Spaltenköpfe und Rundenzeilen haben Tooltips (z. B. „Ansage 1 · richtig · 33 Punkte · Platz 1“, im Korrekturmodus mit Hinweis „Antippen zum Korrigieren“).

## Brand & Design-Tokens (`src/styles/tokens.css`)
- Marke: `--brand-gold #e2b84c`, `--brand-gold-dark #b8932f`, `--brand-green #0f3d2e` (+ `--brand-green-deep`). Gold = Markenakzent (Logo/Wortmarke, Seitentitel-Akzente, Fokusring, aktive Segmented-Pille, Zeremonie-Highlights). Funktionsfarben (grün/rot richtig/falsch, Teal-Tiles) bleiben.
- `--font-display` = „Playfair Display“ (700 italic, per Google Fonts in index.html) – nur für große Überschriften/Wortmarke (`font-family: var(--font-display); font-style: italic`).
- Logo-Assets: `src/assets/brand/logo-icon.png` (Karten-Icon), `logo-transparent.png` (volles Logo); PWA-/Favicon-Icons in `public/` (icon-192/512, icon-maskable-512, apple-touch-icon, favicon). Theme-/Hintergrundfarbe `#0f3d2e`.
- Skalierung: Root-Schrift 100 % bis 1200 px, 106,25 % darüber (nur bei Höhe ≥ 760 px). Button md 44 px, lg 52 px, sm 40 px; PageHeader ~52 px. Auf Tablet+ sollen Hauptseiten nicht scrollen (Listen/Panes scrollen intern).

## Motion (`src/ui/motion.tsx`, über das ui-Barrel; Bibliothek `motion/react`)
Alle Presets beachten `prefers-reduced-motion` (nur Opacity, sofort, keine Bewegung). Nur transform/opacity animieren.
- `springs.snappy | smooth | bouncy` – Spring-Konstanten (`transition={springs.smooth}`); `fadeOnly`.
- `PageTransition` – in `App.tsx` per `AnimatePresence mode="wait"` pro Route (Fade + 8 px Slide). Nicht selbst verwenden.
- `FadeIn` `{delay?, y?}` – Fade + Slide-up beim Mount (motion.div-Props erlaubt).
- `Stagger` `{gap?, delay?, as?}` + `StaggerItem` `{y?, as?}` – gestaffelter Einstieg von Listen/Karten. `StaggerItem` kann auch einzeln mit `layout` genutzt werden.
- `AnimatedNumber` `{value, format?}` – Spring-Zählanimation (Punkte). Beispiel: `<AnimatedNumber value={total} />`.
- `Pressable` / `usePressable({scale?, hover?})` – Tap-Scale (`<motion.button {...usePressable()}>`).
- Re-Exports: `AnimatePresence`, `LayoutGroup`, `motion`, `useReducedMotion`. Reorder-Listen: `<motion.li layout="position" transition={springs.smooth}>`; Punkte-Flash: Key-Wechsel + `initial={{scale:1.35,color:"#e2b84c"}}` (siehe `WatchTableRow` in features/watch).
- Eingebaut: Modal (Scale/Fade, Bottom-Sheet-Slide auf Phones, AnimatePresence → Schließen ist ~150 ms verzögert), Toast (Slide-Stack), Dropdown (Scale vom Ursprung), Tooltip (Fade/Scale), Segmented (gleitende Gold-Pille via layoutId, Markup: Button enthält `<span>` mit Label), CheckToggle (Pop), Button/IconButton/Tile (CSS-Press/Hover-Feedback).
- Tests: `window.scrollTo` ist in `test-setup.ts` gestubbt (motion ruft es in jsdom auf). Bei Tests auf geschlossene Modals ggf. `waitFor`/`waitForElementToBeRemoved` nutzen.
