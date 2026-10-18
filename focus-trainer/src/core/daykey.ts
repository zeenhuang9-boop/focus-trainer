function formatLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 必须用本地小时判断：「epoch 减 dayStartHour 小时」在夏令时切换日与本地小时不等价，
// 会把 04:00 的实例误判成前一天（Europe/London 2026-03-29 实测）。
export function dayKey(epochMs: number, dayStartHour = 4): string {
  const d = new Date(epochMs);
  if (d.getHours() >= dayStartHour) return formatLocal(d);
  return formatLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12));
}

export function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return formatLocal(new Date(y, m - 1, d + delta, 12));
}
