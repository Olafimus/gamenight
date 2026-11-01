/**
 * Pure engine of the "score-sheet" kind. All functions are pure and never mutate their inputs.
 *
 *   cell points   = dice ? scoreDice(category, dice, joker) : entered points (validated)
 *   section total = Σ cells + Σ reached bonuses (threshold on the section sum)
 *   column total  = (Σ section totals + repeat bonuses) × column multiplier
 *   total         = Σ column totals; rank = competition ranking (rules.winner)
 *   turn          = player with the fewest filled cells (seat order breaks ties)
 */
import { assertPlayerIn, assertPlayers, rankTotals, reorderPlayers, type RulesetRef } from "../../core";
import { assertDice, isAllSame, isPossibleScore, scoreDice } from "./dice";
import { sheetCategories, type SheetCategory, type SheetRules } from "./rules";
import type { SheetCell, SheetDerivedColumn, SheetDerivedMatch, SheetDerivedPlayer, SheetEntry, SheetMatchState, SheetSetup } from "./types";

type Grid = Map<string, (SheetCell | null)[][]>; // playerId -> column -> category index -> cell

interface Replay {
  grid: Grid;
  categories: SheetCategory[];
  catIndex: Map<string, number>;
}

function emptyGrid(state: SheetMatchState, categories: SheetCategory[]): Grid {
  const grid: Grid = new Map();
  for (const p of state.setup.players) {
    grid.set(
      p.id,
      state.rules.columns.map(() => categories.map(() => null)),
    );
  }
  return grid;
}

function cellOf(r: Replay, playerId: string, column: number, categoryId: string): SheetCell | null | undefined {
  const idx = r.catIndex.get(categoryId);
  if (idx === undefined) return undefined;
  return r.grid.get(playerId)?.[column]?.[idx];
}

function faceSumCategory(rules: SheetRules, face: number): SheetCategory | undefined {
  return sheetCategories(rules).find((c) => c.scoring.type === "faceSum" && c.scoring.face === face);
}

/**
 * Validates `entry` against the sheet built so far and returns the cell to store.
 * Throws with a readable message if the entry is not allowed.
 */
function evaluate(rules: SheetRules, r: Replay, entry: SheetEntry, entryIndex: number, checkPoints = true): SheetCell {
  const { playerId, column, categoryId } = entry;
  const sheet = r.grid.get(playerId);
  if (!sheet) throw new Error(`Unknown player id: ${playerId}`);
  if (!Number.isInteger(column) || column < 0 || column >= rules.columns.length) throw new Error(`Invalid column: ${column}`);
  const idx = r.catIndex.get(categoryId);
  if (idx === undefined) throw new Error(`Unknown category: ${categoryId}`);
  const category = r.categories[idx] as SheetCategory;
  const col = sheet[column] as (SheetCell | null)[];
  if (col[idx]) throw new Error(`„${category.label}“ is already filled`);
  if (rules.fillOrder === "topDown" && col.slice(0, idx).some((c) => c === null)) {
    throw new Error(`Column must be filled top-down: „${category.label}“ is not next`);
  }

  const rb = rules.repeatBonus;
  const repeatCell = rb ? cellOf(r, playerId, column, rb.categoryId) : null;
  const isRepeatRoll = (allSame: boolean) => !!rb && allSame && !!repeatCell && categoryId !== rb.categoryId;

  let points: number;
  let repeat: boolean;
  if (entry.dice) {
    if (!rules.dice) throw new Error("These rules don't use dice");
    if (category.scoring.type === "manual") throw new Error(`„${category.label}“ is entered manually`);
    assertDice(entry.dice, rules.dice);
    repeat = isRepeatRoll(isAllSame(entry.dice));
    const joker = repeat && rb!.joker !== "none";
    if (joker && rb!.joker === "forced") {
      const upper = faceSumCategory(rules, entry.dice[0] as number);
      if (upper && upper.id !== categoryId && !cellOf(r, playerId, column, upper.id)) {
        throw new Error(`Joker: „${upper.label}“ must be filled first`);
      }
    }
    points = scoreDice(category.scoring, entry.dice, joker);
    if (checkPoints && entry.points !== points) throw new Error(`Points ${entry.points} don't match the dice (${points})`);
  } else {
    if (!isPossibleScore(category.scoring, rules.dice, entry.points)) {
      throw new Error(`${entry.points} is not a possible score for „${category.label}“`);
    }
    points = entry.points;
    repeat = entry.repeat === true;
    if (repeat && !isRepeatRoll(true)) throw new Error("Repeat bonus is not possible here");
  }
  const repeatBonus = repeat && repeatCell && repeatCell.points > 0 ? rb!.points : 0;
  return { points, entryIndex, repeatBonus };
}

function replay(state: SheetMatchState, entries: SheetEntry[] = state.entries): Replay {
  const categories = sheetCategories(state.rules);
  const r: Replay = { grid: emptyGrid(state, categories), categories, catIndex: new Map(categories.map((c, i) => [c.id, i])) };
  entries.forEach((e, i) => {
    const cell = evaluate(state.rules, r, e, i);
    (r.grid.get(e.playerId) as (SheetCell | null)[][])[e.column]![r.catIndex.get(e.categoryId)!] = cell;
  });
  return r;
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/** Derives sheets, sums, bonuses, turn and placements. Throws if an entry is invalid. */
export function deriveSheetMatch(state: SheetMatchState): SheetDerivedMatch {
  const { rules } = state;
  const r = replay(state);
  const perColumn = r.categories.length;
  const totalRounds = perColumn * rules.columns.length;

  const players: SheetDerivedPlayer[] = state.setup.players.map((p, seat) => {
    const sheet = r.grid.get(p.id) as (SheetCell | null)[][];
    let filled = 0;
    const columns: SheetDerivedColumn[] = rules.columns.map((colRule, ci) => {
      const col = sheet[ci] as (SheetCell | null)[];
      const cells: Record<string, SheetCell | null> = {};
      r.categories.forEach((c, i) => (cells[c.id] = col[i] ?? null));
      const sections = rules.sections.map((sec) => {
        const secCells = sec.categories.map((c) => cells[c.id] ?? null);
        const sum = secCells.reduce((a, c) => a + (c?.points ?? 0), 0);
        const reached = sec.bonuses.filter((b) => sum >= b.threshold);
        const bonusPoints = reached.reduce((a, b) => a + b.points, 0);
        return { id: sec.id, sum, bonuses: reached.map((b) => b.id), bonusPoints, total: sum + bonusPoints, filled: secCells.every((c) => c !== null) };
      });
      const repeatBonusPoints = col.reduce((a, c) => a + (c?.repeatBonus ?? 0), 0);
      filled += col.filter((c) => c !== null).length;
      const raw = sections.reduce((a, s) => a + s.total, 0) + repeatBonusPoints;
      return { cells, sections, repeatBonusPoints, raw, multiplier: colRule.multiplier, total: raw * colRule.multiplier };
    });
    return { ...p, seat, columns, filled, total: columns.reduce((a, c) => a + c.total, 0), placement: null };
  });

  const ranks = rankTotals(
    players.map((p) => p.total),
    rules.winner,
  );
  if (state.entries.length > 0) players.forEach((p, i) => (p.placement = ranks[i] ?? 1));

  const roundsPlayed = players.length ? Math.min(...players.map((p) => p.filled)) : 0;
  const finished = players.length > 0 && roundsPlayed >= totalRounds;
  const active = finished ? undefined : players.find((p) => p.filled === roundsPlayed);
  return {
    kind: "score-sheet",
    gameId: state.gameId,
    players,
    totalRounds,
    roundsPlayed,
    roundNumber: finished ? totalRounds : roundsPlayed + 1,
    activePlayerId: active?.id ?? "",
    finished,
  };
}

/** Structural checks (players vs. rules, every entry valid in order). Throws on inconsistency. */
export function assertSheetConsistent(state: SheetMatchState): void {
  assertPlayers(state.setup.players, state.rules.players);
  replay(state);
}

/**
 * Points every open category of a column would score with `dice` (for the UI). Categories that can't be
 * chosen (topDown, forced joker) are left out.
 */
export function previewDice(state: SheetMatchState, playerId: string, column: number, dice: number[]): Record<string, number> {
  const r = replay(state);
  const out: Record<string, number> = {};
  for (const c of r.categories) {
    if (c.scoring.type === "manual") continue;
    try {
      out[c.id] = evaluate(state.rules, r, { playerId, column, categoryId: c.id, points: 0, dice }, -1, false).points;
    } catch {
      // not selectable
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// State transitions (pure). Each returns a new SheetMatchState.
// ---------------------------------------------------------------------------

export interface SheetRulesetInput {
  gameId: string;
  ruleset: RulesetRef;
  rules: SheetRules;
}

export function createSheetMatch(setup: SheetSetup, ruleset: SheetRulesetInput): SheetMatchState {
  assertPlayers(setup.players, ruleset.rules.players);
  return {
    kind: "score-sheet",
    gameId: ruleset.gameId,
    ruleset: { ...ruleset.ruleset },
    rules: ruleset.rules,
    setup: { players: setup.players.map((p) => ({ ...p })) },
    entries: [],
  };
}

export interface SheetEntryInput {
  playerId: string;
  categoryId: string;
  /** default 0 */
  column?: number;
  /** Either the final roll … */
  dice?: number[];
  /** … or the points (required without dice). */
  points?: number;
  /** Without dice: repeated all-same roll (repeat bonus / joker). */
  repeat?: boolean;
}

function toEntry(state: SheetMatchState, input: SheetEntryInput, r: Replay): SheetEntry {
  const base = { playerId: input.playerId, column: input.column ?? 0, categoryId: input.categoryId };
  if (input.dice) {
    const probe: SheetEntry = { ...base, points: 0, dice: [...input.dice] };
    const { points } = evaluate(state.rules, r, probe, -1, false);
    if (input.points !== undefined && input.points !== points) throw new Error(`Points ${input.points} don't match the dice (${points})`);
    return { ...probe, points };
  }
  if (input.points === undefined) throw new Error("Points or dice required");
  return input.repeat ? { ...base, points: input.points, repeat: true } : { ...base, points: input.points };
}

/** Fills one cell. Throws if the cell is filled, the category is unknown or the score impossible. */
export function scoreEntry(state: SheetMatchState, input: SheetEntryInput): SheetMatchState {
  assertPlayerIn(state.setup.players, input.playerId);
  const r = replay(state);
  const entry = toEntry(state, input, r);
  evaluate(state.rules, r, entry, state.entries.length);
  return { ...state, entries: [...state.entries, entry] };
}

export function canUndoEntry(state: SheetMatchState): boolean {
  return state.entries.length > 0;
}

/** Removes the last entry. */
export function undoEntry(state: SheetMatchState): SheetMatchState {
  if (state.entries.length === 0) throw new Error("No entry to undo");
  return { ...state, entries: state.entries.slice(0, -1) };
}

/**
 * Correction of an earlier entry (index into state.entries). Later entries are re-validated; if the
 * correction makes one of them impossible (e.g. joker no longer allowed) the correction is rejected.
 */
export function correctEntry(state: SheetMatchState, entryIndex: number, patch: Pick<SheetEntryInput, "dice" | "points" | "repeat">): SheetMatchState {
  const old = state.entries[entryIndex];
  if (!old) throw new Error(`Invalid entry index: ${entryIndex}`);
  const before = replay(state, state.entries.slice(0, entryIndex));
  const input: SheetEntryInput = { playerId: old.playerId, column: old.column, categoryId: old.categoryId, ...patch };
  const entry = toEntry(state, input, before);
  const next = { ...state, entries: state.entries.map((e, i) => (i === entryIndex ? entry : e)) };
  replay(next);
  return next;
}

/** Clears a filled cell (anywhere in the history). Rejected if later entries depend on it. */
export function clearEntry(state: SheetMatchState, entryIndex: number): SheetMatchState {
  if (!state.entries[entryIndex]) throw new Error(`Invalid entry index: ${entryIndex}`);
  const next = { ...state, entries: state.entries.filter((_, i) => i !== entryIndex) };
  replay(next);
  return next;
}

export function reorderSheetSeats(state: SheetMatchState, orderedIds: string[]): SheetMatchState {
  return { ...state, setup: { ...state.setup, players: reorderPlayers(state.setup.players, orderedIds) } };
}

/** Same players, seat order and rules; empty sheets. */
export function rematchSheet(state: SheetMatchState): SheetMatchState {
  return createSheetMatch(state.setup, { gameId: state.gameId, ruleset: state.ruleset, rules: state.rules });
}
