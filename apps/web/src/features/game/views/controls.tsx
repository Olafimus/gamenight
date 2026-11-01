import { useCallback } from "react";
import { commitBlocker, type TrickMatchState } from "@gamenight/shared";
import { useToast } from "../../../ui";
import { cx } from "../../../ui";
import { haptic } from "../haptics";
import { useGameStore } from "../store";
import styles from "./controls.module.css";

/** Bid stepper with 44px+ touch targets. The value is shown as text (no keyboard popping up on tablets). */
export function BidStepper({
  name,
  value,
  max,
  disabled,
  big,
  onChange,
}: {
  name: string;
  value: number;
  max: number;
  disabled?: boolean;
  big?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={cx(styles.stepper, big && styles.big)} role="group" aria-label={`Ansage von ${name}`}>
      <button type="button" className={styles.step} aria-label={`Ansage von ${name} verringern`} disabled={disabled || value <= 0} onClick={() => onChange(value - 1)}>
        <span aria-hidden="true">−</span>
      </button>
      <output className={styles.val} aria-label={`Ansage von ${name}: ${value}`}>
        {value}
      </output>
      <button type="button" className={styles.step} aria-label={`Ansage von ${name} erhöhen`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

/** ✓ / ✗ pair; state is conveyed by symbol + aria-pressed. Vibrates on tap where supported. */
export function MarkToggle({
  name,
  value,
  disabled,
  big,
  onChange,
}: {
  name: string;
  value: boolean | undefined;
  disabled?: boolean;
  big?: boolean;
  onChange: (v: boolean) => void;
}) {
  const set = (v: boolean) => {
    haptic(10);
    onChange(v);
  };
  return (
    <div className={cx(styles.marks, big && styles.bigMarks)} role="group" aria-label={`${name}: Richtig?`}>
      <button type="button" className={cx(styles.mark, styles.yes)} aria-pressed={value === true} aria-label={`${name}: richtig`} disabled={disabled} onClick={() => set(true)}>
        <span aria-hidden="true">✓</span>
      </button>
      <button type="button" className={cx(styles.mark, styles.no)} aria-pressed={value === false} aria-label={`${name}: falsch`} disabled={disabled} onClick={() => set(false)}>
        <span aria-hidden="true">✗</span>
      </button>
    </div>
  );
}

/** Tricks actually taken (rules with entry "tricks"): "=" takes the bid, stepper adjusts. "–" = not entered yet. */
export function TricksStepper({
  name,
  value,
  bid,
  max,
  disabled,
  big,
  onChange,
}: {
  name: string;
  value: number | undefined;
  bid: number;
  max: number;
  disabled?: boolean;
  big?: boolean;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => {
    haptic(10);
    onChange(Math.max(0, Math.min(max, v)));
  };
  return (
    <div className={cx(styles.stepper, big && styles.big)} role="group" aria-label={`Stiche von ${name}`}>
      <button
        type="button"
        className={cx(styles.mark, styles.yes)}
        aria-pressed={value !== undefined && value === bid}
        aria-label={`${name}: Stiche wie angesagt (${bid})`}
        title="wie angesagt"
        disabled={disabled}
        onClick={() => set(bid)}
      >
        <span aria-hidden="true">=</span>
      </button>
      <button type="button" className={styles.step} aria-label={`Stiche von ${name} verringern`} disabled={disabled || value === 0} onClick={() => set((value ?? 1) - 1)}>
        <span aria-hidden="true">−</span>
      </button>
      <output className={styles.val} aria-label={`Stiche von ${name}: ${value ?? "nicht eingetragen"}`}>
        {value ?? "–"}
      </output>
      <button type="button" className={styles.step} aria-label={`Stiche von ${name} erhöhen`} disabled={disabled || (value ?? -1) >= max} onClick={() => set((value ?? -1) + 1)}>
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

/** Result of a player in the current round: right/wrong, undefined = not entered yet. */
export function currentHit(state: TrickMatchState, playerId: string): boolean | undefined {
  if (state.rules.entry === "tricks") {
    const t = state.current.tricks?.[playerId];
    return t === undefined ? undefined : t === (state.current.bids[playerId] ?? 0);
  }
  return state.current.correct[playerId];
}

/** Result input matching the rules: ✓/✗ (entry "hit") or tricks stepper (entry "tricks"). */
export function ResultControl({
  state,
  player,
  max,
  disabled,
  big,
  actions,
}: {
  state: TrickMatchState;
  player: { id: string; name: string };
  max: number;
  disabled?: boolean;
  big?: boolean;
  actions: RoundActions;
}) {
  if (state.rules.entry === "tricks") {
    return (
      <TricksStepper
        name={player.name}
        value={state.current.tricks?.[player.id]}
        bid={state.current.bids[player.id] ?? 0}
        max={max}
        disabled={disabled}
        big={big}
        onChange={(v) => actions.setTricks(player.id, v)}
      />
    );
  }
  return <MarkToggle name={player.name} value={state.current.correct[player.id]} disabled={disabled} big={big} onChange={(v) => actions.setCorrect(player.id, v)} />;
}

export interface RoundActions {
  setBid: (id: string, v: number) => void;
  setCorrect: (id: string, v: boolean) => void;
  setTricks: (id: string, v: number) => void;
  /** entry "hit": all ✓ / all ✗; entry "tricks": true = everybody made their bid, false = clear results. */
  setAll: (v: boolean) => void;
  reset: () => void;
  commit: () => void;
  undo: () => void;
}

/** Store actions with toast error reporting and haptic feedback on commit. */
export function useRoundActions(): RoundActions {
  const toast = useToast();
  const report = useCallback((err: string | null) => err && toast.show(err, { tone: "error" }), [toast]);
  return {
    setBid: (id, v) => report(useGameStore.getState().setBid(id, v)),
    setCorrect: (id, v) => report(useGameStore.getState().setCorrect(id, v)),
    setTricks: (id, v) => report(useGameStore.getState().setTricks(id, v)),
    setAll: (v) => {
      haptic(10);
      const store = useGameStore.getState();
      const s = store.state;
      if (s?.kind === "trick-bidding" && s.rules.entry === "tricks") {
        if (!v) return void report(store.resetRound());
        for (const p of s.setup.players) {
          const err = useGameStore.getState().setTricks(p.id, s.current.bids[p.id] ?? 0);
          if (err) return void report(err);
        }
        return;
      }
      report(store.setAllCorrect(v));
    },
    reset: () => report(useGameStore.getState().resetRound()),
    commit: () => {
      haptic(10);
      const s = useGameStore.getState().state;
      if (s?.kind === "trick-bidding") {
        const blocker = commitBlocker(s);
        if (blocker === "bid_sum") return void toast.show("Die Ansagen dürfen in Summe nicht der Kartenzahl entsprechen.", { tone: "error" });
        if (blocker === "tricks_sum") return void toast.show("Die Stiche ergeben nicht die Kartenzahl der Runde.", { tone: "error" });
      }
      report(useGameStore.getState().commit());
    },
    undo: () => report(useGameStore.getState().undo()),
  };
}
