import createClient from 'openapi-fetch';
import type { SessionClient } from '../session/session-client';
import { ApiError, detailsOf } from './errors';
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
  throw toError(error, response);
}

// For routes that answer with no body (204, or 200 with nothing in it), where openapi-fetch gives no data.
export async function unwrapEmpty(
  call: Promise<{ error?: unknown; response: Response }>,
): Promise<void> {
  const { error, response } = await call;
  if (response.ok) return;
  throw toError(error, response);
}

function toError(error: unknown, response: Response): ApiError {
  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
      ? error.message
      : response.statusText;
  return new ApiError(response.status, message, detailsOf(error));
}
