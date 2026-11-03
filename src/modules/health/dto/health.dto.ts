import { Expose } from 'class-transformer';

export class HealthResponse {
  @Expose()
  status: 'ok';
}
