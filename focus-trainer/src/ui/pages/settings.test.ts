import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackup } from '../../core/backup';
import { MemoryRepository } from '../../core/storage';
import type { GameId, GameState, SessionRecord, Settings } from '../../core/types';
import type { AppContext } from '../context';
import { renderSettings } from './settings';

// node 环境没有 jsdom，DOM 全靠这套手写桩（风格照 src/ui/pages/home.test.ts）：
// createElement / append / replaceChildren / textContent / className / classList /
// setAttribute / add|removeEventListener，外加 documentElement 与 matchMedia(=undefined)。
class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly dataset: Record<string, string> = {};
  readonly attrs = new Map<string, string>();
  parent: StubEl | null = null;
  hidden = false;
  disabled = false;
  checked = false;
  selected = false;
  value = '';
  files: Array<{ text?: () => Promise<string> }> | null = null;
  text = '';
  private readonly handlers: Array<{ type: string; fn: (ev: never) => void }> = [];

  constructor(readonly tag: string) {}

  get classList(): { add(c: string): void; contains(c: string): boolean; toggle(c: string, on: boolean): boolean } {
    const classes = this.classes;
    return {
      add: (c: string): void => {
        classes.add(c);
      },
      contains: (c: string): boolean => classes.has(c),
      toggle: (c: string, on: boolean): boolean => {
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
    };
  }

  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }

  set textContent(v: string) {
    this.text = v;
    this.children.length = 0;
  }

  set className(v: string) {
    this.classes.clear();
    for (const c of v.split(' ')) if (c) this.classes.add(c);
  }

  get className(): string {
    return [...this.classes].join(' ');
  }

  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }

  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }

  append(...items: Array<StubEl | string>): void {
    for (const item of items) {
      if (typeof item === 'string') this.text += item;
      else {
        item.parent = this;
        this.children.push(item);
      }
    }
  }

  replaceChildren(...items: Array<StubEl | string>): void {
    this.text = '';
    this.children.length = 0;
    this.append(...items);
  }

  addEventListener(type: string, fn: (ev: never) => void): void {
    this.handlers.push({ type, fn });
  }

  removeEventListener(type: string, fn: (ev: never) => void): void {
    const i = this.handlers.findIndex((h) => h.type === type && h.fn === fn);
    if (i >= 0) this.handlers.splice(i, 1);
  }

  /** 真浏览器改下拉/勾选框后会派发 change；桩只管把同类型监听全跑一遍 */
  fire(type: string): void {
    for (const h of this.handlers.filter((x) => x.type === type)) (h.fn as (e: unknown) => void)({ type });
  }

  all(pred: (el: StubEl) => boolean): StubEl[] {
    const out: StubEl[] = [];
    if (pred(this)) out.push(this);
    for (const c of this.children) out.push(...c.all(pred));
    return out;
  }

  find(pred: (el: StubEl) => boolean): StubEl | null {
    return this.all(pred)[0] ?? null;
  }
}

const BASE: Settings = { dayStartHour: 4, theme: 'auto', hapticsEnabled: true, soundEnabled: false };

const session = (gameId: GameId, startedAt: number): SessionRecord => ({
  gameId,
  mode: 'free',
  dayKey: '2026-10-18',
  startedAt,
  durationMs: 1000,
  startLevel: 1,
  endLevel: 2,
  rounds: [],
  summary: { bestTimeMs: 5000 },
  ability: 12,
});

const gameState = (gameId: GameId, level: number): GameState => ({
  gameId,
  level,
  passStreak: 0,
  failStreak: 0,
  lastPlayedDayKey: '2026-10-18',
});

/** 用真实 createBackup 产出备份 JSON，避免手写格式在页面层和 Task 5 之间漂移。 */
async function backupJson(seed: (repo: MemoryRepository) => Promise<void>): Promise<string> {
  const repo = new MemoryRepository();
  await seed(repo);
  return JSON.stringify(await createBackup(repo, 1000));
}

async function setup(initial: Settings = BASE) {
  const view = new StubEl('main');
  const documentElement = new StubEl('html');
  const repo = new MemoryRepository();
  await repo.putSettings(initial);
  const ctx: AppContext = { repo, storageOk: true, settings: { ...initial } };
  const ac = new AbortController();
  // 桩里明确没有 matchMedia：auto 必须解析为浅色，不依赖宿主环境碰巧如何。
  vi.stubGlobal('matchMedia', undefined);
  let confirmAnswer = true;
  const confirmMock = vi.fn(() => confirmAnswer);
  vi.stubGlobal('confirm', confirmMock);
  vi.stubGlobal('document', {
    createElement: (tag: string) => new StubEl(tag),
    documentElement,
  });
  const requireEl = (el: StubEl | null, what: string): StubEl => {
    if (!el) throw new Error(`桩里找不到${what}`);
    return el;
  };
  return {
    view,
    repo,
    ctx,
    ac,
    documentElement,
    confirmMock,
    setConfirm: (answer: boolean): void => {
      confirmAnswer = answer;
    },
    render: (): Promise<void> => renderSettings(view as unknown as HTMLElement, ctx, ac.signal),
    themeSelect: (): StubEl => requireEl(view.find((x) => x.tag === 'select' && x.getAttribute('aria-label') === '主题'), '主题下拉'),
    dayStartSelect: (): StubEl =>
      requireEl(view.find((x) => x.tag === 'select' && x.getAttribute('aria-label') === '每日分界时间'), '每日分界时间下拉'),
    haptics: (): StubEl => requireEl(view.find((x) => x.tag === 'input' && x.getAttribute('aria-label') === '震动反馈'), '震动反馈复选框'),
    sound: (): StubEl => requireEl(view.find((x) => x.tag === 'input' && x.getAttribute('aria-label') === '声音反馈'), '声音反馈复选框'),
    backupText: (): StubEl => requireEl(view.find((x) => x.tag === 'textarea' && x.getAttribute('aria-label') === '备份内容'), '备份内容文本框'),
    pasteText: (): StubEl => requireEl(view.find((x) => x.tag === 'textarea' && x.getAttribute('aria-label') === '导入内容'), '导入内容文本框'),
    backupNote: (): StubEl => requireEl(view.find((x) => x.getAttribute('aria-live') === 'polite'), '备份提示'),
    fileInput: (): StubEl => requireEl(view.find((x) => x.tag === 'input' && x.getAttribute('aria-label') === '选择备份文件'), '文件选择框'),
    button: (label: string): StubEl => requireEl(view.find((x) => x.tag === 'button' && x.textContent === label), label),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderSettings 的主题下拉', () => {
  it('直接选深色：四字段完整落库，html 的 dataset.theme 同步为 dark', async () => {
    const h = await setup();
    await h.render();
    const select = h.themeSelect();
    // 初始选中项跟 ctx.settings.theme 对齐（auto）
    expect(select.children.map((o) => o.getAttribute('value'))).toEqual(['auto', 'light', 'dark']);
    expect(select.children.find((o) => o.selected)?.getAttribute('value')).toBe('auto');

    select.value = 'dark';
    select.fire('change');
    await vi.waitFor(async () => {
      expect(await h.repo.getSettings()).toEqual({
        dayStartHour: 4,
        theme: 'dark',
        hapticsEnabled: true,
        soundEnabled: false,
      });
    });
    expect(h.documentElement.dataset.theme).toBe('dark');
  });

  it('选回 auto：落库保留其它三个字段，桩里无 matchMedia 时 dataset 解析为 light', async () => {
    const h = await setup({ dayStartHour: 2, theme: 'dark', hapticsEnabled: false, soundEnabled: true });
    await h.render();
    const select = h.themeSelect();
    select.value = 'auto';
    select.fire('change');
    await vi.waitFor(async () => {
      expect(await h.repo.getSettings()).toEqual({
        dayStartHour: 2,
        theme: 'auto',
        hapticsEnabled: false,
        soundEnabled: true,
      });
    });
    expect(h.documentElement.dataset.theme).toBe('light');
  });
});

describe('renderSettings 的震动开关', () => {
  it('只改 hapticsEnabled：落库保留 theme 与另外两字段（theme 不被回退成默认值）', async () => {
    const h = await setup({ dayStartHour: 6, theme: 'dark', hapticsEnabled: true, soundEnabled: true });
    await h.render();
    const checkbox = h.haptics();
    expect(checkbox.checked).toBe(true);

    checkbox.checked = false;
    checkbox.fire('change');
    await vi.waitFor(async () => {
      expect(await h.repo.getSettings()).toEqual({
        dayStartHour: 6,
        theme: 'dark',
        hapticsEnabled: false,
        soundEnabled: true,
      });
    });
    // 主题没被这次保存顺手重写：页面上的 dataset 仍是打开设置页前的深色
    expect(h.ctx.settings.theme).toBe('dark');
  });
});

describe('renderSettings 的备份区', () => {
  it('合并导入：粘贴真实备份 JSON，确认后新增 session 并提示导入完成', async () => {
    const h = await setup();
    await h.render();
    h.pasteText().value = await backupJson(async (repo) => {
      await repo.saveSession(session('schulte', 100), gameState('schulte', 3), null);
    });

    h.setConfirm(true);
    h.button('合并导入').fire('click');

    await vi.waitFor(async () => {
      expect((await h.repo.listSessions()).map((s) => [s.gameId, s.startedAt])).toEqual([['schulte', 100]]);
    });
    expect(h.confirmMock).toHaveBeenCalledWith('导入会合并到现有记录，继续？');
    expect(h.backupNote().textContent).toContain('导入完成');
    // 合并走默认模式：本地仍是默认设置时接受备份设置，这里备份也是默认值
    expect(await h.repo.getSettings()).toEqual(BASE);
  });

  it('覆盖导入取消：confirm=false 时仓库原有 session 与提示都不变', async () => {
    const h = await setup();
    await h.repo.saveSession(session('schulte', 100), gameState('schulte', 3), null);
    await h.render();
    const beforeNote = h.backupNote().textContent;
    h.pasteText().value = await backupJson(async (repo) => {
      await repo.saveSession(session('mot', 200), gameState('mot', 2), null);
    });

    h.setConfirm(false);
    h.button('覆盖导入').fire('click');

    expect(h.confirmMock).toHaveBeenCalledWith(
      '覆盖导入会用备份整体替换本机全部训练记录、档位、计划和设置，且不能撤销。继续？',
    );
    expect((await h.repo.listSessions()).map((s) => [s.gameId, s.startedAt])).toEqual([['schulte', 100]]);
    expect(h.backupNote().textContent).toBe(beforeNote);
  });

  it('覆盖导入确认：旧记录被整体替换，设置控件同步为备份里的值', async () => {
    const localSettings: Settings = { dayStartHour: 2, theme: 'light', hapticsEnabled: false, soundEnabled: true };
    const h = await setup(localSettings);
    await h.repo.saveSession(session('schulte', 100), gameState('schulte', 3), null);
    await h.render();

    const backupSettings: Settings = { dayStartHour: 6, theme: 'dark', hapticsEnabled: true, soundEnabled: false };
    h.pasteText().value = await backupJson(async (repo) => {
      await repo.saveSession(session('mot', 200), gameState('mot', 4), null);
      await repo.putSettings(backupSettings);
    });

    h.setConfirm(true);
    h.button('覆盖导入').fire('click');

    await vi.waitFor(async () => {
      expect(await h.repo.getSettings()).toEqual(backupSettings);
    });
    // 本地旧 session 消失，仓库数据等于备份
    expect((await h.repo.listSessions()).map((s) => [s.gameId, s.startedAt])).toEqual([['mot', 200]]);
    expect(await h.repo.listGameStates()).toEqual([gameState('mot', 4)]);
    expect(h.ctx.settings).toEqual(backupSettings);
    expect(h.documentElement.dataset.theme).toBe('dark');

    // 覆盖导入会换掉设置：页面上的四个控件都得跟着新的 ctx.settings 走
    expect(h.themeSelect().value).toBe('dark');
    expect(h.themeSelect().children.find((o) => o.selected)?.getAttribute('value')).toBe('dark');
    expect(h.dayStartSelect().value).toBe('6');
    expect(h.dayStartSelect().children.find((o) => o.selected)?.getAttribute('value')).toBe('6');
    expect(h.haptics().checked).toBe(true);
    expect(h.sound().checked).toBe(false);
    expect(h.backupNote().textContent).toContain('导入完成');
  });

  it('坏 JSON：合并导入不弹确认，提示导入失败，仓库不变', async () => {
    const h = await setup();
    await h.render();
    h.pasteText().value = '{这不是 JSON';

    h.setConfirm(true);
    h.button('合并导入').fire('click');

    // 解析失败必须发生在 confirm 之前：坏数据不该让用户看到合并确认框。
    expect(h.confirmMock).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(h.backupNote().textContent).toContain('导入失败');
    });
    expect(h.confirmMock).not.toHaveBeenCalled();
    expect(await h.repo.listSessions()).toEqual([]);
    expect(await h.repo.getSettings()).toEqual(BASE);
  });

  it('选择文件只把文本填进粘贴框并提示选择导入方式，不直接导入', async () => {
    const h = await setup();
    await h.render();
    const json = await backupJson(async (repo) => {
      await repo.saveSession(session('schulte', 100), gameState('schulte', 3), null);
    });

    const input = h.fileInput();
    input.value = 'C:\\fake\\backup.json';
    input.files = [{ text: async () => json }];
    input.fire('change');

    await vi.waitFor(() => {
      expect(h.pasteText().value).toBe(json);
      expect(input.value).toBe('');
    });
    expect(h.backupNote().textContent).toBe('已读取文件，请选择合并导入或覆盖导入。');
    expect(await h.repo.listSessions()).toEqual([]);
  });

  it('读取文件失败：提示读取失败且文件框被复位', async () => {
    const h = await setup();
    await h.render();
    const input = h.fileInput();
    input.value = 'C:\\fake\\backup.json';
    input.files = [{ text: () => Promise.reject(new Error('文件损坏')) }];

    input.fire('change');

    await vi.waitFor(() => {
      expect(h.backupNote().textContent).toContain('读取文件失败');
      expect(input.value).toBe('');
    });
    expect(h.backupNote().textContent).toContain('文件损坏');
    expect(h.pasteText().value).toBe('');
  });

  it('旧 WebView 没有 File.text() 时退回 FileReader 读取', async () => {
    const h = await setup();
    await h.render();
    const json = await backupJson(async (repo) => {
      await repo.saveSession(session('schulte', 100), gameState('schulte', 3), null);
    });
    class StubFileReader {
      result: string | ArrayBuffer | null = null;
      error: Error | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsText(): void {
        this.result = json;
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', StubFileReader);

    const input = h.fileInput();
    input.value = 'C:\\fake\\backup.json';
    input.files = [{}];
    input.fire('change');

    await vi.waitFor(() => {
      expect(h.pasteText().value).toBe(json);
      expect(input.value).toBe('');
    });
    expect(h.backupNote().textContent).toBe('已读取文件，请选择合并导入或覆盖导入。');
  });

  it('导入成功后清空粘贴框', async () => {
    const h = await setup();
    await h.render();
    h.pasteText().value = await backupJson(async (repo) => {
      await repo.saveSession(session('schulte', 100), gameState('schulte', 3), null);
    });

    h.setConfirm(true);
    h.button('合并导入').fire('click');

    await vi.waitFor(() => {
      expect(h.backupNote().textContent).toContain('导入完成');
    });
    expect(h.pasteText().value).toBe('');
  });

  it('导出成功：剪贴板写入后提示已复制，只读框里是备份 JSON', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const h = await setup();
    await h.render();

    h.button('导出备份').fire('click');

    await vi.waitFor(() => {
      expect(h.backupNote().textContent).toContain('已复制');
    });
    const json = h.backupText().value;
    expect(json).toContain('"format"');
    expect(writeText).toHaveBeenCalledWith(json);
  });

  it('导出失败：读取仓库抛错时提示导出失败且不写剪贴板', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const h = await setup();
    h.repo.dumpAll = async () => {
      throw new Error('数据库读取失败');
    };
    await h.render();

    h.button('导出备份').fire('click');

    await vi.waitFor(() => {
      expect(h.backupNote().textContent).toContain('导出失败');
    });
    expect(h.backupNote().textContent).toContain('数据库读取失败');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('覆盖导入按钮带 danger 类；剪贴板不可用时导出只提示长按复制', async () => {
    // README/WebView 里 navigator.clipboard 可能整个不存在：不能误报已复制。
    vi.stubGlobal('navigator', { clipboard: undefined });
    const h = await setup();
    await h.render();

    expect(h.button('覆盖导入').className.split(' ')).toContain('danger');

    h.button('导出备份').fire('click');
    await vi.waitFor(() => {
      expect(h.backupNote().textContent).toContain('长按复制');
    });
    expect(h.backupNote().textContent).not.toContain('已复制');
    expect(() => JSON.parse(h.backupText().value)).not.toThrow();
  });
});
