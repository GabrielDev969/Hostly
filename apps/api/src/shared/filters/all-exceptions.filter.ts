import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { env } from 'src/config/env.config';

interface NormalizedError {
  statusCode: number;
  error: string;
  message: string;
  details?: string[];
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

const statusText = (status: number): string => STATUS_TEXT[status] ?? 'Error';

// A client error from http-errors, which express middleware passes on: a 4xx status marked safe to expose.
function isClientHttpError(err: unknown): err is Error & { status: number } {
  if (!(err instanceof Error)) return false;
  const { status, expose } = err as Error & { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const normalized = this.normalize(exception);

    if (normalized.statusCode >= 500) {
      this.logger.error(
        {
          err: exception,
          path: request.url,
          method: request.method,
          requestId: request.id,
        },
        'Unhandled exception',
      );
    }

    response.status(normalized.statusCode).json({
      statusCode: normalized.statusCode,
      error: normalized.error,
      message: normalized.message,
      ...(normalized.details && { details: normalized.details }),
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(request.id && { requestId: request.id }),
      ...(env.NODE_ENV !== 'production' &&
        exception instanceof Error && { stack: exception.stack }),
    });
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaKnown(exception);
    }
    if (isClientHttpError(exception)) {
      // Express middleware errors (http-errors) keep their 4xx status; their message can quote the request.
      return {
        statusCode: exception.status,
        error: statusText(exception.status),
        message: statusText(exception.status),
      };
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid database query',
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: statusText(500),
      message: 'An unexpected error occurred',
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const res = exception.getResponse();

    if (typeof res === 'string') {
      return {
        statusCode: status,
        error: statusText(status),
        message: res,
      };
    }

    const obj = res as { message?: string | string[]; error?: string };
    const errorLabel = obj.error ?? statusText(status);

    if (Array.isArray(obj.message)) {
      return {
        statusCode: status,
        error: errorLabel,
        message: 'Validation failed',
        details: obj.message,
      };
    }

    return {
      statusCode: status,
      error: errorLabel,
      message: typeof obj.message === 'string' ? obj.message : exception.message,
    };
  }

  private fromPrismaKnown(err: Prisma.PrismaClientKnownRequestError): NormalizedError {
    switch (err.code) {
      case 'P2002':
        return {
          statusCode: 409,
          error: statusText(409),
          message: 'A record with the provided unique field already exists',
        };
      case 'P2025':
        return {
          statusCode: 404,
          error: statusText(404),
          message: 'Record not found',
        };
      case 'P2003':
        return {
          statusCode: 409,
          error: statusText(409),
          message: 'Foreign key constraint violated',
        };
      case 'P2014':
        return {
          statusCode: 400,
          error: statusText(400),
          message: 'Invalid relation in the request',
        };
      default:
        return {
          statusCode: 500,
          error: statusText(500),
          message: 'Database error',
        };
    }
  }
}
