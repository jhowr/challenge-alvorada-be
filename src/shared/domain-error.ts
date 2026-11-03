/**
 * What went wrong, in business terms. The HTTP layer (HttpErrorFilter) picks
 * the status from it, so services never mention HTTP.
 */
export type DomainErrorKind = 'not_found' | 'conflict';

/**
 * An expected business failure, thrown by services and repositories. Anything
 * else that is thrown is unexpected and answers 500.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly kind: DomainErrorKind;

  /** The fields sent to the client next to `code` and `message`. */
  abstract details(): Record<string, unknown>;
}
