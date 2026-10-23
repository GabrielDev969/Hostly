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
    ['utc', 'UTC'],
    // IANA links keep a region shape and are stored under the name the zone list knows.
    ['US/Eastern', 'America/New_York'],
    ['Brazil/East', 'America/Sao_Paulo'],
  ])('accepts %p and stores it as %p', async (input, canonical) => {
    const dto = build(input);
    expect(await validate(dto)).toEqual([]);
    expect(dto.timezone).toBe(canonical);
    expect(dto.name).toBe('Piso L2');
  });

  // The robot's Java TimeZone turns offsets into GMT silently, and ICU maps abbreviations to some region.
  it.each([
    'Mars/Olympus',
    'GMT+99',
    '+03:00',
    '-0300',
    'EST',
    'MST',
    'EST5EDT',
    'GMT',
    'Etc/GMT+3',
    'Etc/UTC',
    '',
    42,
    null,
  ])('rejects %p', async (input) => {
    const errors = await validate(build(input));
    expect(errors.map((e) => e.property)).toEqual(['timezone']);
    expect(errors[0]!.constraints).toEqual({
      isRegionTimeZone:
        'timezone must be an IANA region time zone such as America/Sao_Paulo, or UTC',
    });
  });
});
