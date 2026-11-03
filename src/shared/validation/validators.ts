import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  ValidateBy,
} from 'class-validator';

// The request pipe stops at the first failing check of each field, so the
// checks below run in order and each field reports a single reason.

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

const isInt32 = (value: unknown): boolean =>
  Number.isInteger(value) &&
  (value as number) >= INT32_MIN &&
  (value as number) <= INT32_MAX;

/** Postgres would store U+FFFD instead of a lone UTF-16 surrogate. */
const IsWellFormed = () =>
  ValidateBy({
    name: 'isWellFormed',
    validator: {
      validate: (value) => typeof value === 'string' && value.isWellFormed(),
      defaultMessage: () => 'must be well-formed Unicode',
    },
  });

/**
 * Any identifier that reaches storage. Control characters (Postgres rejects
 * NUL) and lone surrogates are refused, so what is stored is exactly what
 * was sent.
 */
export const IsIdentifier = () =>
  applyDecorators(
    IsString({ message: 'must be a string' }),
    IsNotEmpty({ message: 'must not be empty' }),
    IsWellFormed(),
    Matches(/^\P{Cc}*$/u, { message: 'must not contain control characters' }),
  );

/** Range boundaries are stored as Postgres int4range. */
export const IsInt32 = () =>
  applyDecorators(
    IsInt({ message: 'must be an integer' }),
    Min(INT32_MIN, { message: `must be >= ${INT32_MIN}` }),
    Max(INT32_MAX, { message: `must be <= ${INT32_MAX}` }),
  );

/**
 * Compares against another int32 property of the same object. Stays silent
 * while either side is invalid, so each field reports only its own problem
 * (decorators run bottom-up, so this one may run before IsInt32).
 */
export const IsGreaterThan = (property: string) =>
  ValidateBy({
    name: 'isGreaterThan',
    validator: {
      validate: (value, args) => {
        const other = (args!.object as Record<string, unknown>)[property];
        return (
          !isInt32(value) ||
          !isInt32(other) ||
          (value as number) > (other as number)
        );
      },
      defaultMessage: () => `must be greater than ${property}`,
    },
  });

const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * Query string values always arrive as strings. Turns numeric-looking values
 * into numbers and leaves everything else untouched, so the validator still
 * reports the original value (`""` must not silently become 0).
 */
export const ToNumber = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && NUMERIC.test(value) ? Number(value) : value,
  );
