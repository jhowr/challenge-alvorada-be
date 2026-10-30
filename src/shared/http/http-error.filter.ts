import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  [key: string]: unknown;
}

const isErrorBody = (body: unknown): body is ErrorBody =>
  typeof body === 'object' && body !== null && 'code' in body;

/** Thrown by body-parser for malformed JSON; it is not an HttpException. */
const isJsonParseError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'type' in error &&
  error.type === 'entity.parse.failed';

const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'validation_error',
  [HttpStatus.NOT_FOUND]: 'route_not_found',
};

/** Gives every error response the same `{ code, message, ... }` shape. */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = this.toResponse(exception);
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (isJsonParseError(exception)) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: 'validation_error',
          message: 'Request body is not valid JSON',
          details: [{ field: '(input)', reason: 'malformed JSON' }],
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isErrorBody(body)) return { status, body };
      return {
        status,
        body: {
          code: CODE_BY_STATUS[status] ?? 'http_error',
          message: exception.message,
        },
      };
    }
    this.logger.error(exception);
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'internal_error', message: 'Unexpected error' },
    };
  }
}
