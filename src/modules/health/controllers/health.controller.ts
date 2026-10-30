import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../../../shared/database/database.module.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool | null) {}

  @Get()
  async check(): Promise<{ status: 'ok'; driver: 'memory' | 'postgres' }> {
    if (!this.pool) return { status: 'ok', driver: 'memory' };
    try {
      await this.pool.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        code: 'database_unavailable',
        message: 'The database is not reachable',
      });
    }
    return { status: 'ok', driver: 'postgres' };
  }
}
