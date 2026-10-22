import { Global, Module } from '@nestjs/common';
import { env } from 'src/config/env.config';
import { MailerService } from './mailer.service';
import { LogMailerService } from './log-mailer.service';
import { ResendMailerService } from './resend-mailer.service';
import { EmailDispatcher } from './email-dispatcher.service';
import { EmailProcessor } from './email.processor';

const mailerProvider = {
  provide: MailerService,
  useClass: env.EMAIL_PROVIDER === 'resend' ? ResendMailerService : LogMailerService,
};

@Global()
@Module({
  providers: [mailerProvider, EmailDispatcher, EmailProcessor],
  exports: [MailerService, EmailDispatcher],
})
export class MailerModule {}
