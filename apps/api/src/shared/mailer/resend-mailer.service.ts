import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { env } from 'src/config/env.config';
import { MailerService, SendEmailInput } from './mailer.service';

@Injectable()
export class ResendMailerService extends MailerService {
  private readonly logger = new Logger('Mailer:Resend');
  private readonly client = new Resend(env.RESEND_API_KEY);

  async send(input: SendEmailInput): Promise<void> {
    const { error } = await this.client.emails.send({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) {
      this.logger.error({ msg: 'Resend send failed', error, to: input.to });
      throw new InternalServerErrorException('Email delivery failed');
    }
  }
}
