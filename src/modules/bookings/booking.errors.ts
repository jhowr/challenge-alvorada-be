import { DomainError } from '../../shared/domain-error';

// The expected failures of the bookings feature.

export class ResourceNotFoundError extends DomainError {
  readonly code = 'resource_not_found';
  readonly kind = 'not_found';

  constructor(readonly resourceId: string) {
    super(`Resource "${resourceId}" does not exist`);
  }

  details() {
    return { resourceId: this.resourceId };
  }
}

export class BookingNotFoundError extends DomainError {
  readonly code = 'booking_not_found';
  readonly kind = 'not_found';

  constructor(readonly id: string) {
    super(`Booking "${id}" does not exist`);
  }

  details() {
    return { id: this.id };
  }
}

export class IdAlreadyUsedError extends DomainError {
  readonly code = 'id_already_used';
  readonly kind = 'conflict';

  constructor(readonly id: string) {
    super(
      `Booking id "${id}" is already used; ids are never reused, even after cancellation`,
    );
  }

  details() {
    return { id: this.id };
  }
}

export class ConflictError extends DomainError {
  readonly code = 'conflict';
  readonly kind = 'conflict';

  constructor(readonly conflictingIds: string[]) {
    super(`The period overlaps active bookings: ${conflictingIds.join(', ')}`);
  }

  details() {
    return { conflictingIds: this.conflictingIds };
  }
}
