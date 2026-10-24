import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Writable } from 'stream';
import { Logger, LoggerModule } from 'nestjs-pino';
import type { Options } from 'pino-http';
import { loggerConfig } from 'src/config/logger.config';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { LogMailerService, maskLinks } from './log-mailer.service';
import {
  buildAcceptInvitationUrl,
  buildPasswordResetUrl,
  buildVerifyEmailUrl,
  invitationEmail,
  passwordResetEmail,
  verifyEmail,
} from './templates';

// os.tmpdir() reads the native environment, which Jest's process.env never reaches: the folder comes from a mock.
jest.mock('os', () => ({ ...jest.requireActual<typeof import('os')>('os'), tmpdir: jest.fn() }));

type LogEntry = Record<string, unknown> & { msg?: string; file?: string };

describe('LogMailerService', () => {
  let app: INestApplication;
  let mailer: LogMailerService;
  let mailRoot: string;
  const realTmpdir = jest.requireActual<typeof import('os')>('os').tmpdir();
  // What the service logs, through the app's real pino config at trace level.
  const logged: string[] = [];
  const logs = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logged.push(chunk.toString('utf8'));
      callback();
    },
  });
  const entries = (): LogEntry[] => logged.map((line) => JSON.parse(line) as LogEntry);
  const sentEntry = (): LogEntry => {
    const entry = entries().find((e) => e.msg === 'Email (not sent — EMAIL_PROVIDER=log)');
    if (!entry) throw new Error('no email log entry');
    return entry;
  };

  beforeAll(async () => {
    const pinoOptions = {
      ...(loggerConfig.pinoHttp as Options),
      level: 'trace',
      transport: undefined,
    };
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot({ ...loggerConfig, pinoHttp: [pinoOptions, logs] })],
      providers: [LogMailerService],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
    mailer = app.get(LogMailerService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    logged.length = 0;
    mailRoot = await mkdtemp(join(realTmpdir, 'hostly-mail-spec-'));
    jest.mocked(tmpdir).mockReturnValue(mailRoot);
  });

  afterEach(async () => {
    await rm(mailRoot, { recursive: true, force: true });
  });

  const token = () => randomBytes(32).toString('hex');

  it.each([
    [
      'invitation',
      (t: string) =>
        invitationEmail({
          workspaceName: 'Acme',
          invitedBy: 'Jane',
          acceptUrl: buildAcceptInvitationUrl(t),
        }),
    ],
    [
      'email verification',
      (t: string) => verifyEmail({ name: 'Jane', verifyUrl: buildVerifyEmailUrl(t) }),
    ],
    [
      'password reset',
      (t: string) => passwordResetEmail({ name: 'Jane', resetUrl: buildPasswordResetUrl(t) }),
    ],
  ])('keeps the %s token out of the log and the whole link in the file', async (_name, build) => {
    const secret = token();
    const message = build(secret);
    await mailer.send({ to: 'jane@example.com', ...message });

    const all = logged.join('');
    expect(all).toContain('Mailer:Log');
    expect(all).not.toContain(secret);

    const entry = sentEntry();
    expect(entry).toMatchObject({
      to: 'jane@example.com',
      subject: message.subject,
      links: [
        {
          url: expect.stringMatching(new RegExp(`\\?token=${secret.slice(0, 4)}…$`)),
          fingerprints: { token: `sha256:${CryptoUtil.hashToken(secret).slice(0, 12)}` },
        },
      ],
    });
    expect(entry).not.toHaveProperty('preview');

    const file = entry.file as string;
    expect(file.startsWith(join(mailRoot, 'hostly-mail'))).toBe(true);
    const content = await readFile(file, 'utf8');
    expect(content).toContain('To: jane@example.com');
    expect(content).toContain(`Subject: ${message.subject}`);
    expect(content).toContain(`?token=${secret}`);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(join(mailRoot, 'hostly-mail'))).mode & 0o777).toBe(0o700);
  });

  it('closes a mail folder others can read before writing to it', async () => {
    await mkdir(join(mailRoot, 'hostly-mail'), { mode: 0o755 });
    await mailer.send({ to: 'a@b.c', subject: 'Hi', html: '', text: 'Hi' });
    expect((await stat(join(mailRoot, 'hostly-mail'))).mode & 0o777).toBe(0o700);
    expect(sentEntry().file).toBeDefined();
  });

  it('refuses a mail folder that is a symlink, and still logs only the masked link', async () => {
    const elsewhere = join(mailRoot, 'elsewhere');
    await mkdir(elsewhere);
    await symlink(elsewhere, join(mailRoot, 'hostly-mail'));
    const secret = token();

    await mailer.send({
      to: 'a@b.c',
      subject: 'Hi',
      html: '',
      text: `Go: https://app/x?token=${secret}`,
    });

    expect(await readdir(elsewhere)).toEqual([]);
    expect(entries().some((e) => e.msg === 'Email not kept on disk')).toBe(true);
    expect(sentEntry().file).toBeUndefined();
    expect(logged.join('')).not.toContain(secret);
  });

  it('removes kept emails older than 7 days', async () => {
    const dir = join(mailRoot, 'hostly-mail');
    await mkdir(dir, { mode: 0o700 });
    const old = join(dir, 'old.txt');
    const recent = join(dir, 'recent.txt');
    await writeFile(old, 'old');
    await writeFile(recent, 'recent');
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(old, eightDaysAgo, eightDaysAgo);

    await mailer.send({ to: 'a@b.c', subject: 'Hi', html: '', text: 'Hi' });

    const names = await readdir(dir);
    expect(names).not.toContain('old.txt');
    expect(names).toContain('recent.txt');
  });
});

describe('maskLinks', () => {
  it('masks every query value and the fragment, whatever their names', () => {
    expect(maskLinks('See https://app.example/a/b?code=abcdef123456&x=1#secretfragment.')).toEqual([
      {
        url: 'https://app.example/a/b?code=abcd…&x=…#secr…',
        fingerprints: {
          code: `sha256:${CryptoUtil.hashToken('abcdef123456').slice(0, 12)}`,
          x: `sha256:${CryptoUtil.hashToken('1').slice(0, 12)}`,
          '#': `sha256:${CryptoUtil.hashToken('secretfragment.').slice(0, 12)}`,
        },
      },
    ]);
  });

  it('drops credentials in the URL and reports a link it cannot parse', () => {
    expect(maskLinks('https://user:pass@app.example/p')).toEqual([
      { url: 'https://app.example/p', fingerprints: {} },
    ]);
    expect(maskLinks('http://[bad')).toEqual([{ url: '[unparseable link]', fingerprints: {} }]);
  });

  it('finds nothing in text without links', () => {
    expect(maskLinks('No links here')).toEqual([]);
  });
});
