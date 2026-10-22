import { Logger } from '@nestjs/common';
import { LogMailerService } from './log-mailer.service';

describe('LogMailerService', () => {
  it('logs the send instead of delivering', async () => {
    const svc = new LogMailerService();
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    await svc.send({
      to: 'a@b.c',
      subject: 'Hi',
      html: '<p>Hi</p>',
      text: 'Hi there',
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
