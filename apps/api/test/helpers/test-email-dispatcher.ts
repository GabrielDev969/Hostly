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

  // The token in the link of the last email to this address: the only place an invitation token goes.
  tokenFor(to: string): string {
    const message = this.lastFor(to);
    const url = message?.text.match(/https?:\/\/\S+/)?.[0];
    const token = url ? new URL(url).searchParams.get('token') : null;
    if (!token) throw new Error(`No email with a token link captured for ${to}`);
    return token;
  }

  reset(): void {
    this.messages = [];
  }
}
