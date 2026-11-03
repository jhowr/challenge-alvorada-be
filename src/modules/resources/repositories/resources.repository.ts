import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceEntity } from '../entities/resource.entity';

@Injectable()
export class ResourcesRepository {
  constructor(
    @InjectRepository(ResourceEntity)
    private readonly resources: Repository<ResourceEntity>,
  ) {}

  /** All resource ids in ascending id order. */
  async list(): Promise<string[]> {
    const rows = await this.resources.find({ order: { id: 'ASC' } });
    return rows.map((row) => row.id);
  }

  exists(id: string): Promise<boolean> {
    return this.resources.existsBy({ id });
  }
}
