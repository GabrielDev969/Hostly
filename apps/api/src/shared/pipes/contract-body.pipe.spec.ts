import { BadRequestException } from '@nestjs/common';
import { pairStartRequestSchema } from '@hostly/contracts';
import { ContractBodyPipe } from './contract-body.pipe';

describe('ContractBodyPipe', () => {
  const pipe = new ContractBodyPipe(pairStartRequestSchema);

  it('returns the parsed body without unknown fields', () => {
    expect(pipe.transform({ serial: 'LB-01', extra: true })).toEqual({ serial: 'LB-01' });
  });

  it.each([[undefined], [{}], [{ serial: 'has space' }], [{ serial: 42 }]])(
    'turns an invalid body (%p) into a 400 with the failing paths',
    (body) => {
      const error = (() => {
        try {
          pipe.transform(body);
        } catch (e) {
          return e;
        }
      })();
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: [expect.stringMatching(/^(serial|body): /)],
      });
    },
  );
});
