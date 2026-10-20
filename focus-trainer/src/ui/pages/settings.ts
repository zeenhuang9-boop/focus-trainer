import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';

const HOURS = [0, 1, 2, 3, 4, 5, 6];

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
  select.addEventListener('change', async () => {
    const settings = { ...ctx.settings, dayStartHour: Number(select.value) };
    await ctx.repo.putSettings(settings);
    ctx.settings = settings;
    note.textContent = `已保存：每天 ${settings.dayStartHour}:00 开始新的一天。`;
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
    note,
    clear,
  );
}
