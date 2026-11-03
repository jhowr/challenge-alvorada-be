import {
  Controller,
  Get,
  SerializeOptions,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HealthResponse } from '../dto/health.dto';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @SerializeOptions({ type: HealthResponse })
  async check(): Promise<HealthResponse> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        code: 'database_unavailable',
        message: 'The database is not reachable',
      });
    }
    return { status: 'ok' };
  }
}
