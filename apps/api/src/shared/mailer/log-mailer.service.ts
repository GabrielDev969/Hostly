import { Injectable, Logger } from '@nestjs/common';
import { MailerService, SendEmailInput } from './mailer.service';

@Injectable()
export class LogMailerService extends MailerService {
  private readonly logger = new Logger('Mailer:Log');

  async send(input: SendEmailInput): Promise<void> {
    this.logger.log({
      msg: 'Email (not sent — EMAIL_PROVIDER=log)',
      to: input.to,
      subject: input.subject,
      preview: input.text.slice(0, 200),
    });
    await Promise.resolve();
  }
}
