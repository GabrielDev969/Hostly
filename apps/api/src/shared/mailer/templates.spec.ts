import {
  buildAcceptInvitationUrl,
  buildPasswordResetUrl,
  buildVerifyEmailUrl,
  invitationEmail,
  passwordResetEmail,
  verifyEmail,
} from './templates';

describe('mail templates', () => {
  it('invitation email contains workspace, inviter and url', () => {
    const out = invitationEmail({
      workspaceName: 'Acme',
      invitedBy: 'Jane',
      acceptUrl: 'https://app/x?token=abc',
    });
    expect(out.subject).toContain('Acme');
    expect(out.text).toContain('Jane');
    expect(out.text).toContain('https://app/x?token=abc');
    expect(out.html).toContain('Jane');
  });

  it('verify email contains name and url', () => {
    const out = verifyEmail({
      name: 'Jane',
      verifyUrl: 'https://app/verify?token=abc',
    });
    expect(out.text).toContain('Jane');
    expect(out.text).toContain('https://app/verify?token=abc');
  });

  it('password reset email contains name and url', () => {
    const out = passwordResetEmail({
      name: 'Jane',
      resetUrl: 'https://app/reset?token=abc',
    });
    expect(out.text).toContain('Jane');
    expect(out.text).toContain('https://app/reset?token=abc');
  });

  it('url builders encode the token query param', () => {
    expect(buildAcceptInvitationUrl('a/b')).toContain('token=a%2Fb');
    expect(buildVerifyEmailUrl('a/b')).toContain('token=a%2Fb');
    expect(buildPasswordResetUrl('a/b')).toContain('token=a%2Fb');
  });
});
