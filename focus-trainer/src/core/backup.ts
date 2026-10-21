import { DEFAULT_SETTINGS, type RepoDump, type Repository } from './storage';
import {
  GAME_IDS,
  type DayPlan,
  type GameId,
  type GameState,
  type SessionRecord,
  type Settings,
  type ThemeMode,
} from './types';

export const BACKUP_FORMAT = 'focus-trainer/backup';
export const BACKUP_APP = 'focus-trainer';
export const BACKUP_VERSION = 1;

export interface BackupData extends RepoDump {
  format: typeof BACKUP_FORMAT;
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: number;
}

export interface ImportSummary {
  addedSessions: number;
  mergedStates: number;
  mergedPlans: number;
}

const THEMES: readonly ThemeMode[] = ['auto', 'light', 'dark'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isGameId = (value: unknown): value is GameId =>
  typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);

const isGameIdArray = (value: unknown): value is GameId[] => Array.isArray(value) && value.every(isGameId);

function asArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`备份格式错误：${name} 不是数组`);
  return value;
}

function asObject(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`备份格式错误：${name} 不是对象`);
  return value;
}

const SESSION_NUMBER_FIELDS = ['startedAt', 'durationMs', 'startLevel', 'endLevel', 'ability'] as const;

function checkSession(value: unknown): SessionRecord {
  const s = asObject(value, '训练记录');
  if (!Number.isFinite(s.id)) throw new Error('备份里的训练记录不完整（id 非法）');
  if (!isGameId(s.gameId)) throw new Error('备份里的训练记录不完整（gameId 非法）');
  if (s.mode !== 'plan' && s.mode !== 'free') throw new Error('备份里的训练记录不完整（mode 非法）');
  if (typeof s.dayKey !== 'string') throw new Error('备份里的训练记录不完整（dayKey 非法）');
  for (const key of SESSION_NUMBER_FIELDS) {
    if (!Number.isFinite(s[key])) throw new Error(`备份里的训练记录不完整（${key} 非法）`);
  }
  if (!Array.isArray(s.rounds)) throw new Error('备份里的训练记录不完整（rounds 非法）');
  if (!isRecord(s.summary)) throw new Error('备份里的训练记录不完整（summary 非法）');
  return s as unknown as SessionRecord;
}

function checkGameState(value: unknown): GameState {
  const g = asObject(value, '档位记录');
  if (!isGameId(g.gameId)) throw new Error('备份里的档位记录不完整（gameId 非法）');
  for (const key of ['level', 'passStreak', 'failStreak'] as const) {
    if (!Number.isFinite(g[key])) throw new Error(`备份里的档位记录不完整（${key} 非法）`);
  }
  if (g.lastPlayedDayKey !== null && typeof g.lastPlayedDayKey !== 'string') {
    throw new Error('备份里的档位记录不完整（lastPlayedDayKey 非法）');
  }
  return g as unknown as GameState;
}

function checkPlan(value: unknown): DayPlan {
  const p = asObject(value, '计划记录');
  if (typeof p.dayKey !== 'string') throw new Error('备份里的计划记录不完整（dayKey 非法）');
  if (!isGameIdArray(p.games)) throw new Error('备份里的计划记录不完整（games 非法）');
  if (!isGameIdArray(p.completed)) throw new Error('备份里的计划记录不完整（completed 非法）');
  return p as unknown as DayPlan;
}

function checkSettings(value: unknown): Settings {
  const s = asObject(value, '设置');
  if (!Number.isFinite(s.dayStartHour)) throw new Error('备份里的设置不完整（dayStartHour 非法）');
  const dayStartHour = s.dayStartHour as number;
  if (s.theme !== undefined && !THEMES.includes(s.theme as ThemeMode)) {
    throw new Error('备份里的设置 theme 非法');
  }
  if (s.hapticsEnabled !== undefined && typeof s.hapticsEnabled !== 'boolean') {
    throw new Error('备份里的设置 hapticsEnabled 非法');
  }
  if (s.soundEnabled !== undefined && typeof s.soundEnabled !== 'boolean') {
    throw new Error('备份里的设置 soundEnabled 非法');
  }
  // 旧备份可能只有 dayStartHour：已出现的字段必须类型正确，缺的按默认值回填。
  return {
    dayStartHour,
    theme: (s.theme as ThemeMode | undefined) ?? DEFAULT_SETTINGS.theme,
    hapticsEnabled: (s.hapticsEnabled as boolean | undefined) ?? DEFAULT_SETTINGS.hapticsEnabled,
    soundEnabled: (s.soundEnabled as boolean | undefined) ?? DEFAULT_SETTINGS.soundEnabled,
  };
}

export function parseBackup(text: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('备份不是合法的 JSON');
  }
  const o = asObject(raw, '根');
  // 新备份同时写 format 与 app；老备份只有 app。任一标记正确即认。
  if (o.format !== BACKUP_FORMAT && o.app !== BACKUP_APP) {
    throw new Error('不是本应用的备份（缺少 format/app 标记）');
  }
  if (o.version !== BACKUP_VERSION) throw new Error(`备份版本不支持：${String(o.version)}`);
  // 旧备份没有 exportedAt 时填 0；出现了就必须是有限数字，Infinity/NaN 一律拒绝。
  if (o.exportedAt !== undefined && !Number.isFinite(o.exportedAt)) {
    throw new Error('备份格式错误：exportedAt 不是有限数字');
  }

  const sessions = asArray(o.sessions, '训练记录（sessions）').map(checkSession);
  const gameStates = asArray(o.gameStates, '档位记录（gameStates）').map(checkGameState);
  const plans = asArray(o.plans, '计划记录（plans）').map(checkPlan);
  const settings = checkSettings(o.settings);

  return {
    format: BACKUP_FORMAT,
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: (o.exportedAt as number | undefined) ?? 0,
    sessions,
    gameStates,
    plans,
    settings,
  };
}

export async function createBackup(repo: Repository, now: number): Promise<BackupData> {
  const dump = await repo.dumpAll();
  return {
    format: BACKUP_FORMAT,
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now,
    ...dump,
  };
}

const sessionKey = (s: SessionRecord): string => `${s.gameId}|${s.startedAt}`;

// 档位比较：level 高者胜；同级时最后练习日更晚者胜（null 视为空串，最旧）。
const newer = (a: GameState, b: GameState): boolean =>
  a.level !== b.level ? a.level > b.level : (a.lastPlayedDayKey ?? '') > (b.lastPlayedDayKey ?? '');

const isDefaultSettings = (s: Settings): boolean =>
  s.dayStartHour === DEFAULT_SETTINGS.dayStartHour &&
  s.theme === DEFAULT_SETTINGS.theme &&
  s.hapticsEnabled === DEFAULT_SETTINGS.hapticsEnabled &&
  s.soundEnabled === DEFAULT_SETTINGS.soundEnabled;

export async function importBackup(
  repo: Repository,
  data: BackupData,
  mode: 'merge' | 'overwrite' = 'merge',
): Promise<ImportSummary> {
  if (mode === 'overwrite') {
    await repo.loadAll({
      sessions: data.sessions.map((s) => ({ ...s })),
      gameStates: data.gameStates.map((g) => ({ ...g })),
      plans: data.plans.map((p) => ({ ...p, games: [...p.games], completed: [...p.completed] })),
      settings: { ...DEFAULT_SETTINGS, ...data.settings },
    });
    return {
      addedSessions: data.sessions.length,
      mergedStates: data.gameStates.length,
      mergedPlans: data.plans.length,
    };
  }

  const local = await repo.dumpAll();

  const seen = new Set(local.sessions.map(sessionKey));
  let nextId = local.sessions.reduce((m, s) => Math.max(m, s.id ?? 0), 0) + 1;
  const sessions: SessionRecord[] = local.sessions.map((s) => ({ ...s, id: s.id ?? nextId++ }));
  let addedSessions = 0;
  for (const s of data.sessions) {
    const key = sessionKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    sessions.push({ ...s, id: nextId++ });
    addedSessions += 1;
  }

  const stateByGame = new Map(local.gameStates.map((g) => [g.gameId, g]));
  let mergedStates = 0;
  for (const g of data.gameStates) {
    const cur = stateByGame.get(g.gameId);
    if (!cur || newer(g, cur)) {
      stateByGame.set(g.gameId, { ...g });
      mergedStates += 1;
    }
  }

  const planByDay = new Map(local.plans.map((p) => [p.dayKey, p]));
  let mergedPlans = 0;
  for (const p of data.plans) {
    const cur = planByDay.get(p.dayKey);
    if (!cur) {
      planByDay.set(p.dayKey, { ...p, games: [...p.games], completed: [...p.completed] });
      mergedPlans += 1;
      continue;
    }
    const completed = [...cur.completed, ...p.completed.filter((id) => !cur.completed.includes(id))];
    if (completed.length !== cur.completed.length) {
      planByDay.set(p.dayKey, { ...cur, completed });
      mergedPlans += 1;
    }
  }

  // 本地设置被用户改过时保留本地；仍是默认值才接受备份里的设置。
  const settings = isDefaultSettings(local.settings) ? { ...data.settings } : local.settings;

  await repo.loadAll({
    sessions,
    gameStates: [...stateByGame.values()],
    plans: [...planByDay.values()],
    settings,
  });
  return { addedSessions, mergedStates, mergedPlans };
}
