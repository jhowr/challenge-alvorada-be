import type { Mocked } from 'vitest';

type PublicMethods<T> = {
  [
    K in keyof T as T[K] extends (...args: never[]) => unknown ? K : never
  ]: T[K];
};

/**
 * Types a set of `vi.fn()` as a class, so it can be passed wherever the class
 * is injected. Only public methods are needed; a class with private fields
 * cannot be satisfied by an object literal otherwise.
 */
export function mockOf<T>(methods: Mocked<PublicMethods<T>>): Mocked<T> {
  return methods as unknown as Mocked<T>;
}
