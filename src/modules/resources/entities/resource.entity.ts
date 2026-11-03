import { Entity, PrimaryColumn } from 'typeorm';

@Entity('resources')
export class ResourceEntity {
  // COLLATE "C" makes ORDER BY id compare bytes (BR13).
  @PrimaryColumn({
    type: 'text',
    collation: 'C',
    primaryKeyConstraintName: 'resources_pkey',
  })
  id: string;
}
