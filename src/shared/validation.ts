import type { z } from 'zod';
import { err, ok, type Result } from './result.js';

export interface ValidationIssue {
  field: string;
  reason: string;
}

export interface ValidationError {
  code: 'validation_error';
  details: ValidationIssue[];
}

export function parseWith<T>(
  schema: z.ZodType<T>,
  input: unknown,
): Result<T, ValidationError> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  return err({
    code: 'validation_error',
    details: parsed.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? issue.path.join('.') : '(input)',
      reason: issue.message,
    })),
  });
}
