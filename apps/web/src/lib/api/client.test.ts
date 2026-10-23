import { describe, expect, it } from 'vitest';
import { unwrapEmpty, unwrapUntyped } from './client';
import { ApiError, toApiError } from './errors';

const validation = {
  statusCode: 400,
  message: 'Validation failed',
  details: ['Password is too common', 42],
};

describe('API errors', () => {
  it('keeps the rules a validation error lists', async () => {
    const call = unwrapEmpty(
      Promise.resolve({ error: validation, response: new Response(null, { status: 400 }) }),
    );

    await expect(call).rejects.toEqual(
      new ApiError(400, 'Validation failed', ['Password is too common']),
    );
    await expect(call).rejects.toHaveProperty('details', ['Password is too common']);
  });

  it('reads the details from a raw response too', async () => {
    const error = await toApiError(Response.json(validation, { status: 400 }));

    expect(error.details).toEqual(['Password is too common']);
  });

  it('hands back an undocumented body for the caller to validate', async () => {
    const body = { workspaceId: 'w' };

    await expect(
      unwrapUntyped(Promise.resolve({ data: body, response: new Response(null, { status: 200 }) })),
    ).resolves.toBe(body);
  });
});
