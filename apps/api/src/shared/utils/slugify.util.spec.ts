import { slugify } from './slugify.util';

describe('slugify', () => {
  it('returns an empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('lowercases, trims and replaces spaces with dashes', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world');
  });

  it('strips diacritics from accented characters', () => {
    expect(slugify('Olá Mundo')).toBe('ola-mundo');
    expect(slugify('São Paulo')).toBe('sao-paulo');
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });

  it('removes non-alphanumeric characters except spaces and dashes', () => {
    expect(slugify('Acme, Inc.!')).toBe('acme-inc');
    expect(slugify('hello@world.com')).toBe('helloworldcom');
  });

  it('strips underscores and collapses repeated dashes/spaces into one', () => {
    expect(slugify('foo___bar---baz')).toBe('foobar-baz');
    expect(slugify('foo  bar')).toBe('foo-bar');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('caps the result at 50 characters', () => {
    const long = 'a'.repeat(120);
    expect(slugify(long)).toHaveLength(50);
  });
});
