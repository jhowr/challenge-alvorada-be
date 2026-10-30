import { compareIds } from '../../../shared/compare-ids.js';
import { RESOURCE_SEED } from '../resources.seed.js';
import type { ResourcesRepository } from './resources.repository.js';

export class InMemoryResourcesRepository implements ResourcesRepository {
  private readonly ids: Set<string>;

  constructor(ids: readonly string[] = RESOURCE_SEED) {
    this.ids = new Set(ids);
  }

  list(): Promise<string[]> {
    return Promise.resolve([...this.ids].sort(compareIds));
  }

  exists(id: string): Promise<boolean> {
    return Promise.resolve(this.ids.has(id));
  }
}
