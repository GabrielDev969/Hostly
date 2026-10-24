import {
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

// Shared by main.ts and createTestApp. No client compresses a request body (#114), so a compressed one gets 415
// before the parser inflates it. Named jsonParser and urlencodedParser, these replace the parsers Nest would add.
export function configureBodyParsers(app: NestExpressApplication): void {
  app.useBodyParser('json', { inflate: false });
  app.useBodyParser('urlencoded', { extended: true, inflate: false });
  app.use(bodyParserErrorHandler);
}

interface BodyParserError {
  status: number;
  type: string;
}

// Body-parser errors carry a status and a type. Their message can quote the body (JSON.parse does), so it never
// reaches the response; Nest's own handler would keep it, as BadRequestException(err.message), for a SyntaxError.
function isBodyParserError(err: unknown): err is BodyParserError {
  if (!(err instanceof Error)) return false;
  const { status, type } = err as Error & Partial<BodyParserError>;
  return typeof type === 'string' && typeof status === 'number' && status >= 400 && status < 500;
}

function toHttpException({ status }: BodyParserError): HttpException {
  if (status === 413) return new PayloadTooLargeException('Payload too large');
  if (status === 415) return new UnsupportedMediaTypeException('Unsupported content encoding');
  return new BadRequestException('Invalid request body');
}

function bodyParserErrorHandler(
  err: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(isBodyParserError(err) ? toHttpException(err) : err);
}
