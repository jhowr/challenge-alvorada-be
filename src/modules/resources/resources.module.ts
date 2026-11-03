import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesController } from './controllers/resources.controller';
import { ResourceEntity } from './entities/resource.entity';
import { ResourcesRepository } from './repositories/resources.repository';
import { ResourcesService } from './services/resources.service';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceEntity])],
  controllers: [ResourcesController],
  providers: [ResourcesService, ResourcesRepository],
  exports: [ResourcesService],
})
export class ResourcesModule {}
