import { Inject, Injectable } from '@nestjs/common';
import {
  RESOURCES_REPOSITORY,
  type ResourcesRepository,
} from '../repositories/resources.repository.js';

@Injectable()
export class ResourcesService {
  constructor(
    @Inject(RESOURCES_REPOSITORY)
    private readonly resources: ResourcesRepository,
  ) {}

  list(): Promise<string[]> {
    return this.resources.list();
  }

  exists(id: string): Promise<boolean> {
    return this.resources.exists(id);
  }
}
