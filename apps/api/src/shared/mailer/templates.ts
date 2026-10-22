import { env } from 'src/config/env.config';

const baseUrl = (): string => env.APP_PUBLIC_URL ?? env.APP_URL;

const layout = (title: string, body: string): string => `
<!doctype html>
<html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#111">
  <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
  ${body}
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
  <p style="color:#666;font-size:12px">If you didn't expect this email, you can ignore it.</p>
</body></html>`;

export interface InvitationEmailVars {
  workspaceName: string;
  invitedBy: string;
  acceptUrl: string;
}

export const invitationEmail = (vars: InvitationEmailVars) => ({
  subject: `You've been invited to ${vars.workspaceName}`,
  text: `${vars.invitedBy} invited you to join "${vars.workspaceName}".\n\nAccept here: ${vars.acceptUrl}\n\nThis link expires in 7 days.`,
  html: layout(
    `You've been invited to ${vars.workspaceName}`,
    `<p>${vars.invitedBy} invited you to join <strong>${vars.workspaceName}</strong>.</p>
     <p style="margin:24px 0"><a href="${vars.acceptUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Accept invitation</a></p>
     <p style="color:#666;font-size:13px">Or open this URL: <br><span style="word-break:break-all">${vars.acceptUrl}</span></p>
     <p style="color:#666;font-size:13px">This link expires in 7 days.</p>`,
  ),
});

export interface VerifyEmailVars {
  name: string;
  verifyUrl: string;
}

export const verifyEmail = (vars: VerifyEmailVars) => ({
  subject: 'Confirm your email',
  text: `Hi ${vars.name},\n\nConfirm your email address: ${vars.verifyUrl}\n\nThis link expires in 24 hours.`,
  html: layout(
    'Confirm your email',
    `<p>Hi ${vars.name},</p>
     <p>Click the button below to confirm your email address.</p>
     <p style="margin:24px 0"><a href="${vars.verifyUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Confirm email</a></p>
     <p style="color:#666;font-size:13px">Or open this URL: <br><span style="word-break:break-all">${vars.verifyUrl}</span></p>
     <p style="color:#666;font-size:13px">This link expires in 24 hours.</p>`,
  ),
});

export interface PasswordResetVars {
  name: string;
  resetUrl: string;
}

export const passwordResetEmail = (vars: PasswordResetVars) => ({
  subject: 'Reset your password',
  text: `Hi ${vars.name},\n\nReset your password: ${vars.resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore it.`,
  html: layout(
    'Reset your password',
    `<p>Hi ${vars.name},</p>
     <p>Click below to choose a new password.</p>
     <p style="margin:24px 0"><a href="${vars.resetUrl}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Reset password</a></p>
     <p style="color:#666;font-size:13px">Or open this URL: <br><span style="word-break:break-all">${vars.resetUrl}</span></p>
     <p style="color:#666;font-size:13px">This link expires in 1 hour. If you didn't request a reset, ignore this email.</p>`,
  ),
});

export const buildAcceptInvitationUrl = (token: string) =>
  `${baseUrl()}/invitations/accept?token=${encodeURIComponent(token)}`;

export const buildVerifyEmailUrl = (token: string) =>
  `${baseUrl()}/auth/verify-email?token=${encodeURIComponent(token)}`;

export const buildPasswordResetUrl = (token: string) =>
  `${baseUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;
