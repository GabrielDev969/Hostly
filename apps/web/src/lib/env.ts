import { z } from 'zod';

const apiUrlSchema = z.url({ protocol: /^https?$/ });

export class MissingConfigError extends Error {
  constructor(readonly variable: string) {
    super(`${variable} is not set or is not a valid http(s) URL`);
  }
}

// Read on first use, not at import: a build without .env (CI) still works, and a bundle without the
// variable fails closed with a visible error instead of calling anywhere.
export function apiUrl(): string {
  const parsed = apiUrlSchema.safeParse(process.env.NEXT_PUBLIC_API_URL);
  if (!parsed.success) throw new MissingConfigError('NEXT_PUBLIC_API_URL');
  return parsed.data.replace(/\/+$/, '');
}
