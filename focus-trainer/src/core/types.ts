export type GameId = 'schulte' | 'stroop' | 'seqmem' | 'mot' | 'gestalt';

export const GAME_IDS: readonly GameId[] = ['schulte', 'stroop', 'seqmem', 'mot', 'gestalt'];

export type Outcome = 'pass' | 'hold' | 'fail';

export type Mode = 'plan' | 'free';

export type InputEvent =
  | { kind: 'cell'; index: number; t: number }
  | { kind: 'choice'; index: number; t: number }
  | { kind: 'point'; x: number; y: number; t: number };

export interface TrialRecord {
  onset: number;
  rt: number | null;
  correct: boolean;
  [field: string]: unknown;
}

export interface RoundResult {
  level: number;
  seed: number;
  trials: TrialRecord[];
  metrics: Record<string, number>;
  timingValid: boolean;
}

export interface GameEngine<S = unknown> {
  configure(level: number, seed: number, roundNo: number): void;
  start(now: number): void;
  input(e: InputEvent): void;
  tick(now: number): void;
  snapshot(): S;
  isDone(): boolean;
  result(): RoundResult;
}

export interface GameView<S = unknown> {
  render(snapshot: S): void;
  destroy(): void;
}

export interface StaircaseRule {
  upAfter: number;
  downAfter: number;
}

export interface RoundRecord extends RoundResult {
  roundNo: number;
  outcome: Outcome;
  score01: number;
  counted: boolean;
}

export interface SummaryItem {
  label: string;
  value: string;
}

export interface GameModule {
  id: GameId;
  name: string;
  ability: string;
  maxLevel: number;
  roundsPerSession: number;
  roundBreak: 'tap' | 'auto';
  staircase: StaircaseRule;
  instructions: string;
  createEngine(): GameEngine;
  createView(host: HTMLElement, emit: (e: InputEvent) => void): GameView;
  judge(r: RoundResult): { outcome: Outcome; score01: number };
  summarize(rounds: readonly RoundRecord[]): Record<string, number>;
  formatSummary(summary: Record<string, number>): SummaryItem[];
}

export interface AdaptiveState {
  level: number;
  passStreak: number;
  failStreak: number;
}

export interface GameState extends AdaptiveState {
  gameId: GameId;
  lastPlayedDayKey: string | null;
}

export interface SessionRecord {
  id?: number;
  gameId: GameId;
  mode: Mode;
  dayKey: string;
  startedAt: number;
  durationMs: number;
  startLevel: number;
  endLevel: number;
  rounds: RoundRecord[];
  summary: Record<string, number>;
  ability: number;
}

export interface DayPlan {
  dayKey: string;
  games: GameId[];
  completed: GameId[];
}

export interface Settings {
  dayStartHour: number;
}
