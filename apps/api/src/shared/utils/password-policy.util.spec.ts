import { validatePasswordPolicy } from './password-policy.util';

describe('validatePasswordPolicy', () => {
  it('returns no errors for a strong password unrelated to the user context', () => {
    const errors = validatePasswordPolicy('Tr0ub4dor#Castle9!', {
      email: 'jane@example.com',
      name: 'Jane Doe',
    });

    expect(errors).toEqual([]);
  });

  it('flags weak passwords across each policy rule', () => {
    expect(validatePasswordPolicy('Sh0rt!')).toEqual(
      expect.arrayContaining([expect.stringMatching(/at least 12 characters/)]),
    );

    expect(validatePasswordPolicy('alllowercase1!')).toEqual(
      expect.arrayContaining([expect.stringMatching(/uppercase/)]),
    );

    expect(validatePasswordPolicy('ALLUPPERCASE1!')).toEqual(
      expect.arrayContaining([expect.stringMatching(/lowercase/)]),
    );

    expect(validatePasswordPolicy('NoNumbersHere!@#')).toEqual(
      expect.arrayContaining([expect.stringMatching(/number/)]),
    );

    expect(validatePasswordPolicy('NoSpecialChars12')).toEqual(
      expect.arrayContaining([expect.stringMatching(/special character/)]),
    );

    expect(validatePasswordPolicy('Has Whitespace1!')).toEqual(
      expect.arrayContaining([expect.stringMatching(/whitespace/)]),
    );

    expect(validatePasswordPolicy('password123')).toEqual(
      expect.arrayContaining([expect.stringMatching(/too common/)]),
    );

    expect(validatePasswordPolicy('Aaaaa1234567!')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/same character more than/),
        expect.stringMatching(/sequences/),
      ]),
    );

    expect(
      validatePasswordPolicy('JaneDoeStrong1!', {
        email: 'jane@example.com',
        name: 'Jane Doe',
      }),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/name or email/)]));
  });
});
