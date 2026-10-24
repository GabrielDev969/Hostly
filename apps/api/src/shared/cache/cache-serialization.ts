const DATE_TAG = '$date';

function isTaggedDate(value: unknown): value is Record<typeof DATE_TAG, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === DATE_TAG;
}

// JSON with every Date tagged as { $date: <epoch ms> }, so a cache hit gives back a Date and not its ISO text.
export function serializeCacheValue(value: unknown): string {
  // JSON.stringify runs Date#toJSON before the replacer, so the Date is only visible on the holder.
  return JSON.stringify(value, function (this: Record<string, unknown>, key: string, v: unknown) {
    const original = this[key];
    return original instanceof Date ? { [DATE_TAG]: original.getTime() } : v;
  });
}

// Throws on anything it did not write, so the caller can treat it as a miss.
export function deserializeCacheValue(raw: string): unknown {
  return JSON.parse(raw, (_key, v: unknown) => {
    if (!isTaggedDate(v)) return v;
    const ms = v[DATE_TAG];
    if (typeof ms !== 'number' || !Number.isFinite(ms)) {
      throw new Error('Cached value has an invalid date');
    }
    return new Date(ms);
  });
}
