import type { Settings, ThemeMode } from '../../core/types';
import type { AppContext } from '../context';
import { createBackup, importBackup, parseBackup } from '../../core/backup';
import { h } from '../dom';
import { navigate } from '../router';
import { applyTheme } from '../theme';

const HOURS = [0, 1, 2, 3, 4, 5, 6];
const THEMES: ReadonlyArray<readonly [ThemeMode, string]> = [
  ['auto', '跟随系统'],
  ['light', '浅色'],
  ['dark', '深色'],
];

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
    '备份包含全部训练记录、档位、计划和设置。合并导入会追加到现有记录；覆盖导入会用备份整体替换本机数据。',
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
    const text = JSON.stringify(await createBackup(ctx.repo, Date.now()), null, 2);
    backupText.value = text;
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

  async function doImport(text: string, mode: 'merge' | 'overwrite'): Promise<void> {
    if (!text.trim()) {
      backupNote.textContent = '没有可导入的内容。';
      return;
    }
    const question =
      mode === 'overwrite'
        ? '覆盖导入会用备份整体替换本机全部训练记录、档位、计划和设置，且不能撤销。继续？'
        : '导入会合并到现有记录，继续？';
    if (!confirm(question)) return;
    try {
      const data = parseBackup(text);
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
      backupNote.textContent = `导入失败：${err instanceof Error ? err.message : String(err)}`;
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file
      .text()
      .then((text) => {
        // 只填进粘贴框；真正导入必须由用户再点「合并导入」或「覆盖导入」并确认。
        pasteText.value = text;
        backupNote.textContent = '已读取文件，请选择合并导入或覆盖导入。';
      })
      .catch((err) => {
        backupNote.textContent = `读取文件失败：${err instanceof Error ? err.message : String(err)}`;
      })
      .finally(() => {
        fileInput.value = '';
      });
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
