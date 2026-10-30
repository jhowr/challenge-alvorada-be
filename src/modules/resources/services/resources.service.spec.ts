import { InMemoryResourcesRepository } from '../repositories/in-memory-resources.repository.js';
import { ResourcesService } from './resources.service.js';

describe('ResourcesService', () => {
  const service = new ResourcesService(
    new InMemoryResourcesRepository(['R2', 'R10', 'R1']),
  );

  it('lists resources in ascending id order', async () => {
    expect(await service.list()).toEqual(['R1', 'R10', 'R2']);
  });

  it('tells whether a resource exists (case-sensitive)', async () => {
    expect(await service.exists('R1')).toBe(true);
    expect(await service.exists('r1')).toBe(false);
  });
});
