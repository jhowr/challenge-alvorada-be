import { mockOf } from '../../../../test/helpers/mock-of';
import type { ResourcesRepository } from '../repositories/resources.repository';
import { ResourcesService } from './resources.service';

describe('ResourcesService', () => {
  const repository = mockOf<ResourcesRepository>({
    list: vi.fn().mockResolvedValue(['R1', 'R10', 'R2']),
    exists: vi.fn(async (id: string) => id === 'R1'),
  });
  const service = new ResourcesService(repository);

  it('lists the resources as the repository orders them', async () => {
    expect(await service.list()).toEqual(['R1', 'R10', 'R2']);
  });

  it('tells whether a resource exists', async () => {
    expect(await service.exists('R1')).toBe(true);
    expect(await service.exists('R9')).toBe(false);
    expect(repository.exists).toHaveBeenCalledWith('R9');
  });
});
