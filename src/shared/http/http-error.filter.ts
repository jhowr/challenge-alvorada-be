import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError, type DomainErrorKind } from '../domain-error';

interface ErrorBody {
  code: string;
  message: string;
  [key: string]: unknown;
}

const isErrorBody = (body: unknown): body is ErrorBody =>
  typeof body === 'object' && body !== null && 'code' in body;

/** Codes for Nest/Express built-in errors, which carry no `code` of their own. */
const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.NOT_FOUND]: 'route_not_found',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'payload_too_large',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'unsupported_media_type',
};

const STATUS_BY_KIND: Record<DomainErrorKind, HttpStatus> = {
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
};

/**
 * Gives every error response the same `{ code, message, ... }` shape, and
 * turns the business failures services throw into their HTTP status.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const { status, body } = this.toResponse(exception);
    if (status >= 500) {
      const request = http.getRequest<Request>();
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    http.getResponse<Response>().status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof DomainError) {
      return {
        status: STATUS_BY_KIND[exception.kind],
        body: {
          code: exception.code,
          message: exception.message,
          ...exception.details(),
        },
      };
    }
    if (!(exception instanceof HttpException)) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: { code: 'internal_error', message: 'Unexpected error' },
      };
    }
    const status = exception.getStatus();
    const body = exception.getResponse();
    if (isErrorBody(body)) return { status, body };
    if (status === HttpStatus.BAD_REQUEST) {
      // Built-in 400s, e.g. a malformed JSON body or URL. The parser message
      // goes into details instead of being the top-level message.
      return {
        status,
        body: {
          code: 'validation_error',
          message: 'Invalid input',
          details: [{ field: '(input)', reason: exception.message }],
        },
      };
    }
    return {
      status,
      body: {
        code: CODE_BY_STATUS[status] ?? 'http_error',
        message: exception.message,
      },
    };
  }
}
