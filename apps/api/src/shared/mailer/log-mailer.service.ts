import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { chmod, lstat, mkdir, readdir, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { MailerService, SendEmailInput } from './mailer.service';

const LINK_PATTERN = /https?:\/\/[^\s"'<>]+/g;
// The longest-lived link in an email (the invitation) lasts 7 days.
const KEEP_FILES_MS = 7 * 24 * 60 * 60 * 1000;

export interface MaskedLink {
  url: string;
  fingerprints: Record<string, string>;
}

// The fingerprint is the start of the sha256 the database keeps for a token, so a log line can be matched to its row.
const fingerprint = (value: string): string => `sha256:${CryptoUtil.hashToken(value).slice(0, 12)}`;

const maskValue = (value: string): string => (value.length > 8 ? `${value.slice(0, 4)}…` : '…');

// Every query value and fragment is masked, whatever its name, so no template wording or parameter name is trusted.
export function maskLinks(text: string): MaskedLink[] {
  return (text.match(LINK_PATTERN) ?? []).map((raw) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return { url: '[unparseable link]', fingerprints: {} };
    }
    const fingerprints: Record<string, string> = {};
    const query = [...url.searchParams].map(([name, value]) => {
      fingerprints[name] = fingerprint(value);
      return `${name}=${maskValue(value)}`;
    });
    let masked = `${url.origin}${url.pathname}${query.length ? `?${query.join('&')}` : ''}`;
    if (url.hash) {
      fingerprints['#'] = fingerprint(url.hash.slice(1));
      masked += `#${maskValue(url.hash.slice(1))}`;
    }
    return { url: masked, fingerprints };
  });
}

@Injectable()
export class LogMailerService extends MailerService {
  private readonly logger = new Logger('Mailer:Log');

  async send(input: SendEmailInput): Promise<void> {
    let file: string | undefined;
    try {
      file = await this.keepOnDisk(input);
    } catch (error) {
      this.logger.warn({
        msg: 'Email not kept on disk',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    this.logger.log({
      msg: 'Email (not sent — EMAIL_PROVIDER=log)',
      to: input.to,
      subject: input.subject,
      links: maskLinks(input.text),
      file,
    });
  }

  // The whole email, links included, goes to a file only this OS user can read, never to the log.
  private async keepOnDisk(input: SendEmailInput): Promise<string> {
    const dir = await this.mailDir();
    await this.prune(dir).catch(() => undefined);
    const stamp = new Date().toISOString().replace(/[-:.]/g, '');
    const recipient = input.to.replace(/[^a-zA-Z0-9@._-]/g, '_').slice(0, 100);
    const file = join(dir, `${stamp}-${recipient}-${randomBytes(2).toString('hex')}.txt`);
    // wx (O_EXCL) refuses an existing file or a planted symlink.
    await writeFile(file, `To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    return file;
  }

  // On Linux the temp dir is shared: refuse a symlink or a folder someone else owns.
  private async mailDir(): Promise<string> {
    const dir = join(tmpdir(), 'hostly-mail');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const info = await lstat(dir);
    if (!info.isDirectory() || (process.getuid && info.uid !== process.getuid())) {
      throw new Error(`${dir} is not a directory owned by this user`);
    }
    if ((info.mode & 0o077) !== 0) await chmod(dir, 0o700);
    return dir;
  }

  private async prune(dir: string): Promise<void> {
    const cutoff = Date.now() - KEEP_FILES_MS;
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.txt')) continue;
      const path = join(dir, name);
      if ((await lstat(path)).mtimeMs < cutoff) await unlink(path);
    }
  }
}
