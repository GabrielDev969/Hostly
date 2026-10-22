import { EmailProcessor } from './email.processor';
import { MailerService } from './mailer.service';
import { SEND_EMAIL_JOB } from './email.job';
import type { Job } from 'bullmq';

describe('EmailProcessor', () => {
  let mailer: jest.Mocked<MailerService>;
  let processor: EmailProcessor;

  beforeEach(() => {
    mailer = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    processor = new EmailProcessor(mailer);
  });

  it('forwards send-email jobs to MailerService', async () => {
    const job = {
      name: SEND_EMAIL_JOB,
      data: {
        to: 'a@b.c',
        subject: 'Hi',
        html: '<p>Hi</p>',
        text: 'Hi',
      },
    } as unknown as Job<{
      to: string;
      subject: string;
      html: string;
      text: string;
    }>;
    await processor.process(job);
    expect(mailer.send).toHaveBeenCalledWith(job.data);
  });

  it('ignores unknown job names without sending', async () => {
    const job = {
      name: 'unknown',
      data: { to: 'a@b.c', subject: 'x', html: '', text: '' },
    } as unknown as Job<{
      to: string;
      subject: string;
      html: string;
      text: string;
    }>;
    await processor.process(job);
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
