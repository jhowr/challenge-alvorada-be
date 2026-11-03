import { Controller, Get } from '@nestjs/common';
import { ResourcesService } from '../services/resources.service';

@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  list(): Promise<string[]> {
    return this.resourcesService.list();
  }
}
