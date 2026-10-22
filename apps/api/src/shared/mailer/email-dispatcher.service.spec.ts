import type { Queue } from 'bullmq';
import { EmailDispatcher } from './email-dispatcher.service';
import { SEND_EMAIL_JOB } from './email.job';

describe('EmailDispatcher', () => {
  it('enqueues a send-email job', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const queue = { add } as unknown as Queue<{
      to: string;
      subject: string;
      html: string;
      text: string;
    }>;
    const dispatcher = new EmailDispatcher(queue);
    await dispatcher.enqueue({
      to: 'a@b.c',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    });
    expect(add).toHaveBeenCalledWith(SEND_EMAIL_JOB, {
      to: 'a@b.c',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi',
    });
  });
});
