import { describe, expect, it } from 'vitest';
import { HOME_PATH, safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it('keeps a same-origin path with its query', () => {
    expect(safeNextPath('/robots?client=abc')).toBe('/robots?client=abc');
  });

  it.each([
    ['//evil.com'],
    ['/\\evil.com'],
    ['https://evil.com'],
    ['/\t/evil.com'],
    ['/\n/evil.com'],
    ['/robots\\..\\x'],
    ['javascript:alert(1)'],
    ['evil.com'],
    [''],
    [null],
    [undefined],
  ])('sends %j to the panel home', (raw) => {
    expect(safeNextPath(raw)).toBe(HOME_PATH);
  });
});
