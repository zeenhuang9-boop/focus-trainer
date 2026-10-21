import type { Settings } from '../../core/types';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';

const HOURS = [0, 1, 2, 3, 4, 5, 6];

async function save(ctx: AppContext, patch: Partial<Settings>, note: HTMLElement, text: string): Promise<void> {
  const settings: Settings = { ...ctx.settings, ...patch };
  // 先同步落到内存再 await：连续快速改两个开关时，后一次 save 必须看到前一次已合并的
  // ctx.settings，否则两次各基于旧值展开，后写覆盖前写。
  ctx.settings = settings;
  await ctx.repo.putSettings(settings);
  note.textContent = text;
}

export async function renderSettings(view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  const note = h('p', { class: 'muted' }, '这个时间之前的训练算作前一天。');
  const select = h(
    'select',
    { 'aria-label': '每日分界时间' },
    ...HOURS.map((hour) => {
      const option = h('option', { value: hour }, `${hour}:00`);
      option.selected = hour === ctx.settings.dayStartHour;
      return option;
    }),
  );
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
  const clear = h(
    'button',
    {
      class: 'danger',
      onclick: async () => {
        if (!confirm('清空全部训练记录、档位和计划？此操作不能撤销。')) return;
        await ctx.repo.clearAll();
        ctx.settings = await ctx.repo.getSettings();
        navigate({ name: 'home' });
      },
    },
    '清空数据',
  );
  view.replaceChildren(
    h('h1', null, '设置'),
    h('div', { class: 'card' }, h('span', null, '每日分界时间'), h('span', { class: 'spacer' }), select),
    h('label', { class: 'card' }, h('span', null, '震动反馈'), h('span', { class: 'spacer' }), haptics),
    h('label', { class: 'card' }, h('span', null, '声音反馈'), h('span', { class: 'spacer' }), sound),
    note,
    clear,
  );
}
