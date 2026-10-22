export const SEND_EMAIL_JOB = 'send-email';

export interface SendEmailJobData {
  to: string;
  subject: string;
  html: string;
  text: string;
}
