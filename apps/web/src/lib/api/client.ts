import createClient from 'openapi-fetch';
import type { SessionClient } from '../session/session-client';
import { ApiError } from './errors';
import type { components, paths } from './schema';

export type ApiClient = ReturnType<typeof createApiClient>;
export type Schemas = components['schemas'];

export function createApiClient(session: SessionClient, baseUrl: string) {
  return createClient<paths>({ baseUrl, fetch: (request) => session.fetch(request) });
}

// openapi-fetch resolves errors as values; screens and queries want them thrown.
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await call;
  if (response.ok && data !== undefined) return data;
  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
      ? error.message
      : response.statusText;
  throw new ApiError(response.status, message);
}
