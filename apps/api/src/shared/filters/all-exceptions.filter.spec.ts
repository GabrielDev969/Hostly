import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  function buildHost(reqOverrides: Record<string, unknown> = {}) {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status };
    const request = {
      url: '/api/v1/users/abc',
      method: 'GET',
      id: 'req-1',
      ...reqOverrides,
    };
    const host: ArgumentsHost = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
        getNext: () => undefined,
      }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes HttpExceptions, validation arrays and Prisma error codes', () => {
    const cases: Array<{
      exception: unknown;
      statusCode: number;
      message: string;
      details?: string[];
      error: string;
    }> = [
      {
        exception: new NotFoundException('User not found'),
        statusCode: 404,
        message: 'User not found',
        error: 'Not Found',
      },
      {
        exception: new BadRequestException({
          message: ['email must be a valid email'],
          error: 'Bad Request',
          statusCode: 400,
        }),
        statusCode: 400,
        message: 'Validation failed',
        details: ['email must be a valid email'],
        error: 'Bad Request',
      },
      {
        exception: Object.assign(
          new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: '7',
          }),
          {},
        ),
        statusCode: 409,
        message: 'A record with the provided unique field already exists',
        error: 'Conflict',
      },
      {
        exception: new Prisma.PrismaClientKnownRequestError('missing', {
          code: 'P2025',
          clientVersion: '7',
        }),
        statusCode: 404,
        message: 'Record not found',
        error: 'Not Found',
      },
      {
        exception: new ConflictException('Email taken'),
        statusCode: 409,
        message: 'Email taken',
        error: 'Conflict',
      },
    ];

    for (const c of cases) {
      const { host, status, json } = buildHost();
      filter.catch(c.exception, host);

      expect(status).toHaveBeenCalledWith(c.statusCode);
      const body = json.mock.calls[0][0] as Record<string, unknown>;
      expect(body).toMatchObject({
        statusCode: c.statusCode,
        error: c.error,
        message: c.message,
        path: '/api/v1/users/abc',
        requestId: 'req-1',
      });
      expect(body.timestamp).toEqual(expect.any(String));
      if (c.details) expect(body.details).toEqual(c.details);
      else expect(body).not.toHaveProperty('details');
    }
  });

  it('handles HttpException whose response body is a plain string', () => {
    const { host, status, json } = buildHost();
    const exception = new HttpException('teapot mode', 418);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(418);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      statusCode: 418,
      error: 'Error',
      message: 'teapot mode',
    });
  });

  it('falls back to exception.message when HttpException response has no message field', () => {
    const { host, status, json } = buildHost();
    const exception = new HttpException({ error: 'Custom Error' }, 422);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(422);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      statusCode: 422,
      error: 'Custom Error',
      message: expect.any(String),
    });
  });

  it.each([
    ['P2003', 409, 'Conflict', 'Foreign key constraint violated'],
    ['P2014', 400, 'Bad Request', 'Invalid relation in the request'],
  ])('maps Prisma %s to status %d', (code, expectedStatus, expectedError, expectedMessage) => {
    const { host, status, json } = buildHost();
    const exception = new Prisma.PrismaClientKnownRequestError('msg', {
      code,
      clientVersion: '7',
    });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      statusCode: expectedStatus,
      error: expectedError,
      message: expectedMessage,
    });
  });

  it('keeps the 4xx status of an http-errors error without echoing its message', () => {
    const { host, status, json } = buildHost();
    const exception = Object.assign(
      new SyntaxError('Unexpected token, "secret" is not valid JSON'),
      {
        status: 415,
        expose: true,
        type: 'encoding.unsupported',
      },
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(415);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      statusCode: 415,
      error: 'Unsupported Media Type',
      message: 'Unsupported Media Type',
    });
    expect(body.message).not.toContain('secret');
  });

  it('treats an unexposed http-errors error as unknown', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status } = buildHost();

    filter.catch(Object.assign(new Error('internal'), { status: 400, expose: false }), host);

    expect(status).toHaveBeenCalledWith(500);
  });

  it('maps unknown Prisma error codes to a generic 500 database error', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status, json } = buildHost();
    const exception = new Prisma.PrismaClientKnownRequestError('msg', {
      code: 'P9999',
      clientVersion: '7',
    });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Database error',
    });
  });

  it('maps PrismaClientValidationError to 400 Bad Request', () => {
    const { host, status, json } = buildHost();
    const exception = new Prisma.PrismaClientValidationError('bad query', {
      clientVersion: '7',
    });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid database query',
    });
  });

  it('omits requestId when the request has no id', () => {
    const { host, json } = buildHost({ id: undefined });
    filter.catch(new NotFoundException('x'), host);

    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('requestId');
  });

  it('maps unknown errors to 500 and logs them', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status, json } = buildHost();

    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
    expect(body.stack).toEqual(expect.any(String));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-1' }),
      'Unhandled exception',
    );
  });
});
