import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../shared/database/database.module.js';
import { ResourcesController } from './controllers/resources.controller.js';
import { InMemoryResourcesRepository } from './repositories/in-memory-resources.repository.js';
import { PostgresResourcesRepository } from './repositories/postgres-resources.repository.js';
import { RESOURCES_REPOSITORY } from './repositories/resources.repository.js';
import { RESOURCE_SEED } from './resources.seed.js';
import { ResourcesService } from './services/resources.service.js';

@Module({
  controllers: [ResourcesController],
  providers: [
    ResourcesService,
    {
      provide: RESOURCES_REPOSITORY,
      inject: [PG_POOL],
      useFactory: async (pool: Pool | null) => {
        if (!pool) return new InMemoryResourcesRepository();
        const repository = new PostgresResourcesRepository(pool);
        await repository.seed(RESOURCE_SEED);
        return repository;
      },
    },
  ],
  exports: [ResourcesService],
})
export class ResourcesModule {}
