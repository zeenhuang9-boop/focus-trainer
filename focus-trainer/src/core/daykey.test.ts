import { describe, expect, it } from 'vitest';
import { addDays, dayKey } from './daykey';

// 本仓未安装 @types/node（且约定不新增依赖），用最小环境声明补上 process 的类型；仅类型声明，运行期被擦除，仍用真实 Node process。
declare const process: { env: { TZ?: string } };

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

  it('夏令时开始日仍按本地小时分界', () => {
    const saved = process.env.TZ;
    process.env.TZ = 'Europe/London';
    try {
      // 只在进程内改 TZ 真的生效时才断言，避免在不支持的平台上当然是绿的
      const probe = new Date(2026, 2, 29, 12, 0);
      if (probe.getTimezoneOffset() === -60) {
        expect(dayKey(probe.getTime())).toBe('2026-03-29');
        expect(dayKey(at(2026, 3, 29, 4, 0))).toBe('2026-03-29');
        expect(dayKey(at(2026, 3, 29, 3, 30))).toBe('2026-03-28');
      }
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
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
