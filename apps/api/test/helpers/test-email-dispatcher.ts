import type { SendEmailJobData } from '../../src/shared/mailer/email.job';

export class TestEmailDispatcher {
  public messages: SendEmailJobData[] = [];

  enqueue(data: SendEmailJobData): Promise<void> {
    this.messages.push(data);
    return Promise.resolve();
  }

  lastFor(to: string): SendEmailJobData | undefined {
    return [...this.messages].reverse().find((m) => m.to === to);
  }

  reset(): void {
    this.messages = [];
  }
}
