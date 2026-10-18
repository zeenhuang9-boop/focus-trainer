const HOUR_MS = 3_600_000;

function formatLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayKey(epochMs: number, dayStartHour = 4): string {
  return formatLocal(new Date(epochMs - dayStartHour * HOUR_MS));
}

export function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return formatLocal(new Date(y, m - 1, d + delta, 12));
}
