export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export abstract class MailerService {
  abstract send(input: SendEmailInput): Promise<void>;
}
