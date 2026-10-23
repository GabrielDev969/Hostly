import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSiteDto } from './update-site.dto';

describe('UpdateSiteDto', () => {
  it('stores the canonical spelling of a region time zone', async () => {
    const dto = plainToInstance(UpdateSiteDto, { timezone: 'america/manaus' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.timezone).toBe('America/Manaus');
  });

  it.each(['+03:00', 'EST', 'Etc/UTC'])('rejects %p', async (timezone) => {
    const errors = await validate(plainToInstance(UpdateSiteDto, { timezone }));
    expect(errors.map((e) => e.property)).toEqual(['timezone']);
  });

  it('leaves the time zone alone when it is absent', async () => {
    const dto = plainToInstance(UpdateSiteDto, { name: 'Piso L3' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.timezone).toBeUndefined();
  });
});
