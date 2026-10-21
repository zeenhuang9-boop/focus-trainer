import type { Settings, ThemeMode } from '../../core/types';
import type { AppContext } from '../context';
import { createBackup, importBackup, parseBackup, type BackupData } from '../../core/backup';
import { h } from '../dom';
import { navigate } from '../router';
import { applyTheme } from '../theme';

const HOURS = [0, 1, 2, 3, 4, 5, 6];
const THEMES: ReadonlyArray<readonly [ThemeMode, string]> = [
  ['auto', '跟随系统'],
  ['light', '浅色'],
  ['dark', '深色'],
];

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** 老 Android WebView 可能没有 File.text()：优先标准 API，缺失时退回 FileReader（同步异常也会变成 rejection）。 */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('无法读取文件'));
    reader.readAsText(file);
  });
}

async function save(ctx: AppContext, patch: Partial<Settings>, note: HTMLElement, text: string): Promise<void> {
  const settings: Settings = { ...ctx.settings, ...patch };
  // 先同步落到内存再 await：连续快速改两个开关时，后一次 save 必须看到前一次已合并的
  // ctx.settings，否则两次各基于旧值展开，后写覆盖前写。
  ctx.settings = settings;
  applyTheme(document.documentElement, settings.theme);
  await ctx.repo.putSettings(settings);
  note.textContent = text;
}

export async function renderSettings(view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  const note = h('p', { class: 'muted' }, '这个时间之前的训练算作前一天。');
  const dayOptions = HOURS.map((hour) => {
    const option = h('option', { value: hour }, `${hour}:00`);
    option.selected = hour === ctx.settings.dayStartHour;
    return option;
  });
  const select = h('select', { 'aria-label': '每日分界时间' }, ...dayOptions);
  select.addEventListener('change', () => {
    const dayStartHour = Number(select.value);
    void save(ctx, { dayStartHour }, note, `已保存：每天 ${dayStartHour}:00 开始新的一天。`);
  });
  const haptics = h('input', { type: 'checkbox', 'aria-label': '震动反馈' });
  haptics.checked = ctx.settings.hapticsEnabled;
  haptics.addEventListener('change', () => {
    void save(ctx, { hapticsEnabled: haptics.checked }, note, `震动反馈已${haptics.checked ? '开启' : '关闭'}。`);
  });
  const sound = h('input', { type: 'checkbox', 'aria-label': '声音反馈' });
  sound.checked = ctx.settings.soundEnabled;
  sound.addEventListener('change', () => {
    void save(ctx, { soundEnabled: sound.checked }, note, `声音反馈已${sound.checked ? '开启' : '关闭'}。`);
  });
  const themeOptions = THEMES.map(([value, label]) => {
    const option = h('option', { value }, label);
    option.selected = value === ctx.settings.theme;
    return option;
  });
  const themeSelect = h('select', { 'aria-label': '主题' }, ...themeOptions);
  themeSelect.addEventListener('change', () => {
    void save(ctx, { theme: themeSelect.value as ThemeMode }, note, '主题已保存。');
  });
  const backupNote = h(
    'p',
    { class: 'muted', 'aria-live': 'polite' },
    '备份包含全部训练记录、档位、计划和设置。合并导入会追加训练记录，并保留同日计划里打卡更完整的一份（一样完整时保留本机）；覆盖导入会用备份整体替换本机数据。',
  );
  const backupText = h('textarea', { class: 'backup-text', readonly: true, 'aria-label': '备份内容', rows: 6 });
  const pasteText = h('textarea', {
    class: 'backup-text',
    'aria-label': '导入内容',
    rows: 6,
    placeholder: '把备份内容粘贴到这里',
  });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': '选择备份文件' });
  fileInput.hidden = true;

  // 覆盖导入会整体换掉 settings（本地仍是默认值时，合并也会接受备份里的设置），
  // 导入成功后四个控件必须跟新的 ctx.settings 对齐，不能停在旧值上。
  function syncSettingsControls(): void {
    select.value = String(ctx.settings.dayStartHour);
    for (const option of dayOptions) {
      option.selected = option.getAttribute('value') === String(ctx.settings.dayStartHour);
    }
    themeSelect.value = ctx.settings.theme;
    for (const option of themeOptions) {
      option.selected = option.getAttribute('value') === ctx.settings.theme;
    }
    haptics.checked = ctx.settings.hapticsEnabled;
    sound.checked = ctx.settings.soundEnabled;
  }

  async function doExport(): Promise<void> {
    // 先清空：导出失败时不能把上一份有效备份留在只读框里，让人误当成当前数据复制走。
    backupText.value = '';
    let text: string;
    try {
      text = JSON.stringify(await createBackup(ctx.repo, Date.now()), null, 2);
      backupText.value = text;
    } catch (err) {
      // 读取仓库/序列化失败：只报错，绝不能再碰剪贴板，否则会让人以为导出成功。
      backupNote.textContent = `导出失败：${errorText(err)}`;
      return;
    }
    try {
      // WebView / README 环境里 navigator.clipboard 可能整个不存在：不存在也算失败，
      // 必须走「长按手动复制」的兜底提示，不能误报已复制。
      const clipboard = globalThis.navigator?.clipboard;
      if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error('剪贴板不可用');
      await clipboard.writeText(text);
      backupNote.textContent = `备份已复制到剪贴板（${text.length} 字符），也可从下方文本框手动复制。`;
    } catch {
      backupNote.textContent = '已生成备份，请从下方文本框长按复制。';
    }
  }

  // 导入是「读全库 → 纯计算 → 整库写回」：两个导入交错会把前一个的结果覆盖掉。
  // 一个 in-flight 标志贯穿整个异步过程，期间四个备份按钮都禁用（finally 里一定复位）。
  let backupBusy = false;

  function setBackupBusy(busy: boolean): void {
    backupBusy = busy;
    for (const button of [exportBtn, importFileBtn, mergeImportBtn, overwriteImportBtn]) {
      button.disabled = busy;
    }
  }

  async function doImport(text: string, mode: 'merge' | 'overwrite'): Promise<void> {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      if (!text.trim()) {
        backupNote.textContent = '没有可导入的内容。';
        return;
      }
      let data: BackupData;
      try {
        // 先校验再确认：坏 JSON 不该弹出合并/覆盖确认框。
        data = parseBackup(text);
      } catch (err) {
        backupNote.textContent = `导入失败：${errorText(err)}`;
        return;
      }
      const question =
        mode === 'overwrite'
          ? '覆盖导入会用备份整体替换本机全部训练记录、档位、计划和设置，且不能撤销。继续？'
          : '导入会合并到现有记录，继续？';
      if (!confirm(question)) return;
      try {
        const summary =
          mode === 'overwrite'
            ? await importBackup(ctx.repo, data, 'overwrite')
            : await importBackup(ctx.repo, data);
        ctx.settings = await ctx.repo.getSettings();
        applyTheme(document.documentElement, ctx.settings.theme);
        syncSettingsControls();
        pasteText.value = '';
        backupNote.textContent =
          mode === 'overwrite'
            ? `覆盖导入完成：${summary.addedSessions} 次训练、${summary.mergedStates} 条档位、${summary.mergedPlans} 天计划已替换本机数据。`
            : `导入完成：新增 ${summary.addedSessions} 次训练，合并 ${summary.mergedStates} 条档位、${summary.mergedPlans} 天计划。`;
      } catch (err) {
        backupNote.textContent = `导入失败：${errorText(err)}`;
      }
    } finally {
      setBackupBusy(false);
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const text = await readFileText(file);
        // 只填进粘贴框；真正导入必须由用户再点「合并导入」或「覆盖导入」并确认。
        pasteText.value = text;
        backupNote.textContent = '已读取文件，请选择合并导入或覆盖导入。';
      } catch (err) {
        backupNote.textContent = `读取文件失败：${errorText(err)}`;
      } finally {
        // 含旧 WebView 缺 File.text() 的同步异常在内，任何路径都要复位，才能再次选同一个文件。
        fileInput.value = '';
      }
    })();
  });

  const exportBtn = h('button', { onclick: () => void doExport() }, '导出备份');
  const importFileBtn = h('button', { onclick: () => fileInput.click() }, '选择备份文件');
  const mergeImportBtn = h('button', { onclick: () => void doImport(pasteText.value, 'merge') }, '合并导入');
  const overwriteImportBtn = h(
    'button',
    { class: 'danger', onclick: () => void doImport(pasteText.value, 'overwrite') },
    '覆盖导入',
  );
  const clear = h(
    'button',
    {
      class: 'danger',
      onclick: async () => {
        if (!confirm('清空全部训练记录、档位和计划？此操作不能撤销。')) return;
        await ctx.repo.clearAll();
        ctx.settings = await ctx.repo.getSettings();
        applyTheme(document.documentElement, ctx.settings.theme);
        navigate({ name: 'home' });
      },
    },
    '清空数据',
  );
  view.replaceChildren(
    h('h1', null, '设置'),
    h('div', { class: 'card' }, h('span', null, '每日分界时间'), h('span', { class: 'spacer' }), select),
    h('div', { class: 'card' }, h('span', null, '主题'), h('span', { class: 'spacer' }), themeSelect),
    h('label', { class: 'card' }, h('span', null, '震动反馈'), h('span', { class: 'spacer' }), haptics),
    h('label', { class: 'card' }, h('span', null, '声音反馈'), h('span', { class: 'spacer' }), sound),
    note,
    h('h2', null, '数据备份'),
    backupNote,
    h('div', { class: 'row backup-actions' }, exportBtn, importFileBtn, mergeImportBtn, overwriteImportBtn),
    fileInput,
    backupText,
    pasteText,
    clear,
  );
}
