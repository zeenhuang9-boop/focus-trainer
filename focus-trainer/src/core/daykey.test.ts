import { describe, expect, it } from 'vitest';
import { addDays, dayKey } from './daykey';

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('dayKey', () => {
  it('默认 04:00 分界：03:59 算前一天，04:00 算当天', () => {
    expect(dayKey(at(2026, 10, 18, 3, 59))).toBe('2026-10-17');
    expect(dayKey(at(2026, 10, 18, 4, 0))).toBe('2026-10-18');
    expect(dayKey(at(2026, 10, 18, 23, 59))).toBe('2026-10-18');
  });

  it('分界改成 0 点时按自然日', () => {
    expect(dayKey(at(2026, 10, 18, 0, 30), 0)).toBe('2026-10-18');
    expect(dayKey(at(2026, 10, 18, 3, 59), 0)).toBe('2026-10-18');
  });

  it('跨月与跨年', () => {
    expect(dayKey(at(2026, 11, 1, 2, 0))).toBe('2026-10-31');
    expect(dayKey(at(2027, 1, 1, 1, 0))).toBe('2026-12-31');
  });

  it('月和日补零', () => {
    expect(dayKey(at(2026, 3, 5, 12, 0))).toBe('2026-03-05');
  });
});

describe('addDays', () => {
  it('前后推算并跨月跨年', () => {
    expect(addDays('2026-10-18', 1)).toBe('2026-10-19');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-18', 0)).toBe('2026-10-18');
  });
});
