import { BadRequestException, type Paramtype, type Type } from '@nestjs/common';
import {
  RequestValidationPipe,
  type ValidationIssue,
} from '../../src/shared/validation/validation.pipe';

type Validated<T> =
  { ok: true; value: T } | { ok: false; details: ValidationIssue[] };

/** Runs a request DTO through the same pipe the app uses. */
export async function validateRequest<T>(
  type: Type<T>,
  value: unknown,
  source: Paramtype = 'body',
): Promise<Validated<T>> {
  try {
    const transformed = (await new RequestValidationPipe().transform(value, {
      type: source,
      metatype: type,
    })) as T;
    return { ok: true, value: transformed };
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    const body = error.getResponse() as { details: ValidationIssue[] };
    return { ok: false, details: body.details };
  }
}

/** The fields reported as invalid, in order; fails if the value was valid. */
export async function invalidFields<T>(
  type: Type<T>,
  value: unknown,
  source: Paramtype = 'body',
): Promise<string[]> {
  const result = await validateRequest(type, value, source);
  if (result.ok) throw new Error('expected a validation error');
  return result.details.map((issue) => issue.field);
}
