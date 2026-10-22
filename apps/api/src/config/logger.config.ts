import { randomUUID } from 'crypto';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'http';
import { env } from './env.config';

const REQUEST_ID_HEADER = 'x-request-id';

type RequestExtras = {
  id?: string | number;
  user?: { id?: string };
  workspace?: { id?: string; role?: { name?: string } };
};

const defaultLogLevel =
  env.LOG_LEVEL ??
  (env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug');

const usePretty = env.LOG_PRETTY ?? env.NODE_ENV !== 'production';

export const loggerConfig: Params = {
  pinoHttp: {
    level: defaultLogLevel,
    transport: usePretty
      ? {
          target: 'pino-pretty',
          options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
        }
      : undefined,
    genReqId: (req, res) => {
      const incoming = req.headers[REQUEST_ID_HEADER];
      const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    customAttributeKeys: {
      req: 'request',
      res: 'response',
      responseTime: 'durationMs',
      reqId: 'requestId',
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req, res, responseTime) =>
      `${req.method} ${req.url} ${res.statusCode} ${Math.round(responseTime)}ms`,
    customErrorMessage: (req, res, error) =>
      `${req.method} ${req.url} ${res.statusCode} failed: ${error.message}`,
    customProps: (req: IncomingMessage) => {
      const r = req as IncomingMessage & RequestExtras;
      return {
        userId: r.user?.id,
        workspaceId: r.workspace?.id,
        role: r.workspace?.role?.name,
      };
    },
    serializers: {
      req: (req: IncomingMessage & RequestExtras) => ({
        method: req.method,
        url: req.url,
        id: req.id,
      }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
    },
    redact: ['request.headers.authorization', 'request.headers.cookie'],
  },
};
