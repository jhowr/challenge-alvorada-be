export const RESOURCES_REPOSITORY = Symbol('RESOURCES_REPOSITORY');

export interface ResourcesRepository {
  /** All resource ids in ascending id order. */
  list(): Promise<string[]>;
  exists(id: string): Promise<boolean>;
}
