import { INITIAL_ADAPTIVE } from './adaptive';
import type { DayPlan, GameId, GameState, SessionRecord, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = { dayStartHour: 4, theme: 'auto', hapticsEnabled: true, soundEnabled: false };

export function defaultGameState(gameId: GameId): GameState {
  return { gameId, ...INITIAL_ADAPTIVE, lastPlayedDayKey: null };
}

export interface RepoDump {
  sessions: SessionRecord[];
  gameStates: GameState[];
  plans: DayPlan[];
  settings: Settings;
}

export interface Repository {
  getGameState(gameId: GameId): Promise<GameState>;
  listGameStates(): Promise<GameState[]>;
  getPlan(dayKey: string): Promise<DayPlan | null>;
  putPlan(plan: DayPlan): Promise<void>;
  listPlans(): Promise<DayPlan[]>;
  listSessions(gameId?: GameId): Promise<SessionRecord[]>;
  lastSession(gameId: GameId): Promise<SessionRecord | null>;
  getSession(id: number): Promise<SessionRecord | null>;
  saveSession(rec: SessionRecord, state: GameState, plan: DayPlan | null): Promise<number>;
  getSettings(): Promise<Settings>;
  putSettings(settings: Settings): Promise<void>;
  dumpAll(): Promise<RepoDump>;
  loadAll(data: RepoDump): Promise<void>;
  clearAll(): Promise<void>;
}

const byStartedAt = (a: SessionRecord, b: SessionRecord) => a.startedAt - b.startedAt;

// 两种实现必须拒绝同一批坏数据：内存实现对缺 key 的记录会静默写进 undefined 键，
// 真机 IndexedDB 会抛错并回滚，测试（跑内存实现）就会给出与设备相反的结论。
function assertWriteKeys(rec: SessionRecord, state: GameState, plan: DayPlan | null): void {
  if (typeof rec.gameId !== 'string' || typeof rec.dayKey !== 'string') throw new TypeError('session 缺 gameId 或 dayKey');
  if (typeof state.gameId !== 'string') throw new TypeError('gameState 缺 gameId');
  if (plan !== null && typeof plan.dayKey !== 'string') throw new TypeError('plan 缺 dayKey');
}

export class MemoryRepository implements Repository {
  private sessions: SessionRecord[] = [];
  private states = new Map<GameId, GameState>();
  private plans = new Map<string, DayPlan>();
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private nextId = 1;

  async getGameState(gameId: GameId): Promise<GameState> {
    const s = this.states.get(gameId);
    return s ? structuredClone(s) : defaultGameState(gameId);
  }

  async listGameStates(): Promise<GameState[]> {
    return [...this.states.values()]
      .sort((a, b) => (a.gameId < b.gameId ? -1 : 1))
      .map((s) => structuredClone(s));
  }

  async getPlan(dayKey: string): Promise<DayPlan | null> {
    const p = this.plans.get(dayKey);
    return p ? structuredClone(p) : null;
  }

  async putPlan(plan: DayPlan): Promise<void> {
    this.plans.set(plan.dayKey, structuredClone(plan));
  }

  async listPlans(): Promise<DayPlan[]> {
    return [...this.plans.values()]
      .sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1))
      .map((p) => structuredClone(p));
  }

  async listSessions(gameId?: GameId): Promise<SessionRecord[]> {
    return this.sessions
      .filter((s) => gameId === undefined || s.gameId === gameId)
      .sort(byStartedAt)
      .map((s) => structuredClone(s));
  }

  async lastSession(gameId: GameId): Promise<SessionRecord | null> {
    const list = await this.listSessions(gameId);
    return list.length > 0 ? list[list.length - 1] : null;
  }

  async getSession(id: number): Promise<SessionRecord | null> {
    const s = this.sessions.find((x) => x.id === id);
    return s ? structuredClone(s) : null;
  }

  async saveSession(rec: SessionRecord, state: GameState, plan: DayPlan | null): Promise<number> {
    assertWriteKeys(rec, state, plan);
    const id = this.nextId++;
    this.sessions.push({ ...structuredClone(rec), id });
    this.states.set(state.gameId, structuredClone(state));
    if (plan) this.plans.set(plan.dayKey, structuredClone(plan));
    return id;
  }

  async getSettings(): Promise<Settings> {
    return { ...this.settings };
  }

  async putSettings(settings: Settings): Promise<void> {
    this.settings = { ...settings };
  }

  async dumpAll(): Promise<RepoDump> {
    return {
      sessions: await this.listSessions(),
      gameStates: await this.listGameStates(),
      plans: await this.listPlans(),
      settings: await this.getSettings(),
    };
  }

  async loadAll(data: RepoDump): Promise<void> {
    const ids = new Set<number>();
    for (const s of data.sessions) {
      if (s.id === undefined) throw new TypeError('loadAll 的 session 缺 id');
      if (ids.has(s.id)) throw new TypeError(`loadAll 的 session id 重复：${s.id}`);
      ids.add(s.id);
    }
    for (const g of data.gameStates) {
      if (typeof g.gameId !== 'string') throw new TypeError('loadAll 的 gameState 缺 gameId');
    }
    for (const p of data.plans) {
      if (typeof p.dayKey !== 'string') throw new TypeError('loadAll 的 plan 缺 dayKey');
    }
    // 先全部校验再落库：内存实现没有事务回滚，半份数据比抛错更难查。
    this.sessions = data.sessions.map((s) => structuredClone(s));
    this.states = new Map(data.gameStates.map((g) => [g.gameId, structuredClone(g)]));
    this.plans = new Map(data.plans.map((p) => [p.dayKey, structuredClone(p)]));
    this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    this.nextId = this.sessions.reduce((m, s) => Math.max(m, s.id ?? 0), 0) + 1;
  }

  async clearAll(): Promise<void> {
    this.sessions = [];
    this.states.clear();
    this.plans.clear();
    this.settings = { ...DEFAULT_SETTINGS };
  }
}

const DB_VERSION = 1;
const SETTINGS_KEY = 'settings';
const ALL_STORES = ['sessions', 'gameState', 'plans', 'settings'];

type SettingsRow = Partial<Settings> & { key: string };

function settingsFromRow(row: Partial<Settings> | undefined): Settings {
  return {
    dayStartHour: row?.dayStartHour ?? DEFAULT_SETTINGS.dayStartHour,
    theme: row?.theme ?? DEFAULT_SETTINGS.theme,
    hapticsEnabled: row?.hapticsEnabled ?? DEFAULT_SETTINGS.hapticsEnabled,
    soundEnabled: row?.soundEnabled ?? DEFAULT_SETTINGS.soundEnabled,
  };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

class IdbRepository implements Repository {
  constructor(private readonly db: IDBDatabase) {}

  private store(name: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    return this.db.transaction(name, mode).objectStore(name);
  }

  async getGameState(gameId: GameId): Promise<GameState> {
    const s = await req<GameState | undefined>(this.store('gameState').get(gameId));
    return s ?? defaultGameState(gameId);
  }

  listGameStates(): Promise<GameState[]> {
    return req<GameState[]>(this.store('gameState').getAll());
  }

  async getPlan(dayKey: string): Promise<DayPlan | null> {
    const p = await req<DayPlan | undefined>(this.store('plans').get(dayKey));
    return p ?? null;
  }

  async putPlan(plan: DayPlan): Promise<void> {
    const tx = this.db.transaction('plans', 'readwrite');
    const done = txDone(tx);
    tx.objectStore('plans').put(plan);
    await done;
  }

  listPlans(): Promise<DayPlan[]> {
    return req<DayPlan[]>(this.store('plans').getAll());
  }

  async listSessions(gameId?: GameId): Promise<SessionRecord[]> {
    const sessions = this.store('sessions');
    if (gameId === undefined) {
      const all = await req<SessionRecord[]>(sessions.getAll());
      return all.sort(byStartedAt);
    }
    const range = IDBKeyRange.bound([gameId, -Infinity], [gameId, Infinity]);
    return req<SessionRecord[]>(sessions.index('byGameStarted').getAll(range));
  }

  async lastSession(gameId: GameId): Promise<SessionRecord | null> {
    const list = await this.listSessions(gameId);
    return list.length > 0 ? list[list.length - 1] : null;
  }

  async getSession(id: number): Promise<SessionRecord | null> {
    const s = await req<SessionRecord | undefined>(this.store('sessions').get(id));
    return s ?? null;
  }

  async saveSession(rec: SessionRecord, state: GameState, plan: DayPlan | null): Promise<number> {
    assertWriteKeys(rec, state, plan);
    const tx = this.db.transaction(['sessions', 'gameState', 'plans'], 'readwrite');
    const done = txDone(tx);
    // 自增主键：值为 undefined 的 id 属性会让 add 抛 DataError，必须去掉
    const toAdd: SessionRecord = { ...rec };
    delete toAdd.id;
    let idReq: IDBRequest<IDBValidKey>;
    try {
      idReq = tx.objectStore('sessions').add(toAdd);
      tx.objectStore('gameState').put(state);
      if (plan) tx.objectStore('plans').put(plan);
    } catch (err) {
      tx.abort();
      await done.catch(() => undefined);
      throw err;
    }
    const [id] = await Promise.all([req(idReq), done]);
    return id as number;
  }

  async getSettings(): Promise<Settings> {
    const row = await req<SettingsRow | undefined>(this.store('settings').get(SETTINGS_KEY));
    return settingsFromRow(row);
  }

  async putSettings(settings: Settings): Promise<void> {
    const tx = this.db.transaction('settings', 'readwrite');
    const done = txDone(tx);
    tx.objectStore('settings').put({ key: SETTINGS_KEY, ...settings });
    await done;
  }

  async dumpAll(): Promise<RepoDump> {
    // 四类数据必须在同一个只读事务里取，导出才是同一时刻的一致快照。
    const tx = this.db.transaction(ALL_STORES, 'readonly');
    const done = txDone(tx);
    const sessionsReq = req<SessionRecord[]>(tx.objectStore('sessions').getAll());
    const statesReq = req<GameState[]>(tx.objectStore('gameState').getAll());
    const plansReq = req<DayPlan[]>(tx.objectStore('plans').getAll());
    const settingsReq = req<SettingsRow | undefined>(tx.objectStore('settings').get(SETTINGS_KEY));
    const [sessions, gameStates, plans, row] = await Promise.all([
      sessionsReq,
      statesReq,
      plansReq,
      settingsReq,
      done,
    ]);
    return {
      sessions: sessions.sort(byStartedAt),
      gameStates,
      plans,
      settings: settingsFromRow(row),
    };
  }

  async loadAll(data: RepoDump): Promise<void> {
    const tx = this.db.transaction(ALL_STORES, 'readwrite');
    const done = txDone(tx);
    try {
      const sessions = tx.objectStore('sessions');
      const states = tx.objectStore('gameState');
      const plans = tx.objectStore('plans');
      const settings = tx.objectStore('settings');
      sessions.clear();
      states.clear();
      plans.clear();
      settings.clear();
      for (const s of data.sessions) {
        if (s.id === undefined) throw new TypeError('loadAll 的 session 缺 id');
        sessions.add(s);
      }
      for (const g of data.gameStates) states.put(g);
      for (const p of data.plans) plans.put(p);
      settings.put({ key: SETTINGS_KEY, ...DEFAULT_SETTINGS, ...data.settings });
    } catch (err) {
      tx.abort();
      await done.catch(() => undefined);
      throw err;
    }
    await done;
  }

  async clearAll(): Promise<void> {
    const tx = this.db.transaction(ALL_STORES, 'readwrite');
    const done = txDone(tx);
    for (const name of ALL_STORES) tx.objectStore(name).clear();
    await done;
  }
}

export async function openIdbRepository(name = 'focus-trainer'): Promise<Repository> {
  const open = indexedDB.open(name, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    const sessions = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
    sessions.createIndex('byGameStarted', ['gameId', 'startedAt']);
    sessions.createIndex('byDay', 'dayKey');
    db.createObjectStore('gameState', { keyPath: 'gameId' });
    db.createObjectStore('plans', { keyPath: 'dayKey' });
    db.createObjectStore('settings', { keyPath: 'key' });
  };
  const db = await req(open);
  return new IdbRepository(db);
}
