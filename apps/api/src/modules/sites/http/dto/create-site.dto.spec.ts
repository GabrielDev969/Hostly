import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSiteDto } from './create-site.dto';

const build = (timezone: unknown) =>
  plainToInstance(CreateSiteDto, {
    clientId: '0b9c3f1e-8a4e-4c1a-9a57-2f1d7c1b9e10',
    name: '  Piso L2 ',
    timezone,
  });

describe('CreateSiteDto', () => {
  it.each([
    ['America/Sao_Paulo', 'America/Sao_Paulo'],
    ['america/sao_paulo', 'America/Sao_Paulo'],
    [' UTC ', 'UTC'],
  ])('accepts %p and stores it as %p', async (input, canonical) => {
    const dto = build(input);
    expect(await validate(dto)).toEqual([]);
    expect(dto.timezone).toBe(canonical);
    expect(dto.name).toBe('Piso L2');
  });

  it.each(['Mars/Olympus', 'GMT+99', '', 42, null])('rejects %p', async (input) => {
    const errors = await validate(build(input));
    expect(errors.map((e) => e.property)).toEqual(['timezone']);
  });
});
