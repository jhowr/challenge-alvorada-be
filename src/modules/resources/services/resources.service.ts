import { Injectable } from '@nestjs/common';
import { ResourcesRepository } from '../repositories/resources.repository';

@Injectable()
export class ResourcesService {
  constructor(private readonly resources: ResourcesRepository) {}

  list(): Promise<string[]> {
    return this.resources.list();
  }

  exists(id: string): Promise<boolean> {
    return this.resources.exists(id);
  }
}
