import { deserializeCacheValue, serializeCacheValue } from './cache-serialization';

const roundTrip = (value: unknown): unknown => deserializeCacheValue(serializeCacheValue(value));

describe('cache serialization', () => {
  const at = new Date('2026-10-23T12:34:56.789Z');

  it('gives back a Date at the top level, to the millisecond', () => {
    const result = roundTrip(at);
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getTime()).toBe(at.getTime());
  });

  it('gives back nested Dates and Dates in lists', () => {
    const value = {
      id: 'u1',
      lockedUntil: at,
      session: { expiresAt: at, revokedAt: null },
      roles: [{ createdAt: at }, { createdAt: new Date(0) }],
      history: [at, null],
    };
    expect(roundTrip(value)).toStrictEqual(value);
  });

  it('keeps null, at the top level and in fields', () => {
    expect(roundTrip(null)).toBeNull();
    expect(roundTrip({ a: null })).toStrictEqual({ a: null });
  });

  it('keeps text that looks like a date as text', () => {
    expect(roundTrip('2026-10-23T12:34:56.789Z')).toBe('2026-10-23T12:34:56.789Z');
    expect(roundTrip({ note: '2026-10-23' })).toStrictEqual({ note: '2026-10-23' });
  });

  it('leaves values without Dates untouched', () => {
    const value = { key: 'billing', enabled: true, n: 3, tags: ['a'], nested: { x: false } };
    expect(roundTrip(value)).toStrictEqual(value);
  });

  it('only revives the exact tag it writes', () => {
    expect(deserializeCacheValue('{"$date":1,"other":2}')).toStrictEqual({ $date: 1, other: 2 });
  });

  it.each(['{"$date":"x"}', '{"$date":null}', '2026-10-23T12:34:56.789Z'])(
    'throws on %s, which it never writes',
    (raw) => {
      expect(() => deserializeCacheValue(raw)).toThrow();
    },
  );
});
