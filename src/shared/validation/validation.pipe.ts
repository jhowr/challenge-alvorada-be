import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';

export interface ValidationIssue {
  field: string;
  reason: string;
}

// class-validator's constraint for a property the DTO does not declare.
const UNKNOWN_PROPERTY = 'whitelistValidation';

function toIssues(errors: ValidationError[], prefix = ''): ValidationIssue[] {
  return errors.flatMap((error) => {
    const field = `${prefix}${error.property}`;
    const own = Object.entries(error.constraints ?? {}).map(
      ([constraint, message]) => ({
        field,
        reason: constraint === UNKNOWN_PROPERTY ? 'is not allowed' : message,
      }),
    );
    return [...own, ...toIssues(error.children ?? [], `${field}.`)];
  });
}

const invalidInput = (details: ValidationIssue[]) =>
  new BadRequestException({
    code: 'validation_error',
    message: 'Invalid input',
    details,
  });

/**
 * Validates every request DTO: values are transformed into the DTO class,
 * properties it does not declare are refused (a typo, or `status` sent on
 * create, must not be silently ignored), and each invalid field is reported
 * once, in the `{ code, message, details }` shape of every other error.
 * Properties the DTO does not declare are listed first.
 */
@Injectable()
export class RequestValidationPipe extends ValidationPipe {
  constructor() {
    super({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: true,
      exceptionFactory: (errors) => invalidInput(toIssues(errors)),
    });
  }

  override async transform(
    value: unknown,
    metadata: ArgumentMetadata,
  ): Promise<unknown> {
    // A JSON array would otherwise be validated as an object missing every
    // field, which explains the wrong problem.
    const isObject =
      typeof value === 'object' && value !== null && !Array.isArray(value);
    if (metadata.type === 'body' && !isObject) {
      throw invalidInput([
        { field: '(input)', reason: 'must be a JSON object' },
      ]);
    }
    // Keys such as toString or constructor never reach the DTO instance
    // (class-transformer skips them), so the whitelist would not see them.
    const inherited = isObject
      ? Object.keys(value).filter((key) => key in Object.prototype)
      : [];
    if (metadata.metatype && inherited.length > 0) {
      throw invalidInput(
        inherited.map((field) => ({ field, reason: 'is not allowed' })),
      );
    }
    return super.transform(value, metadata);
  }
}
