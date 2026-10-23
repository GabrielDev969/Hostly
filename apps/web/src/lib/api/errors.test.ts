import { describe, expect, it } from 'vitest';
import { toApiError } from './errors';

const reply = (body: unknown, status = 400) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('toApiError', () => {
  it('keeps the message and the validation details as the API wrote them', async () => {
    const error = await toApiError(
      reply({ statusCode: 400, message: 'Validation failed', details: ['timezone must be X'] }),
    );
    expect(error.status).toBe(400);
    expect(error.message).toBe('Validation failed');
    expect(error.details).toEqual(['timezone must be X']);
  });

  it('leaves details empty when the body has none, or not as a list of texts', async () => {
    expect((await toApiError(reply({ message: 'Client not found' }, 404))).details).toEqual([]);
    expect((await toApiError(reply({ message: 'x', details: [1, 2] }))).details).toEqual([]);
    expect((await toApiError(new Response('oops', { status: 502 }))).details).toEqual([]);
  });
});
