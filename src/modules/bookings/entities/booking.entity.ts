import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Exclusion,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ResourceEntity } from '../../resources/entities/resource.entity';
import type { BookingStatus } from '../booking.types';

/**
 * Mirrors the schema created by the migrations, constraint names included, so
 * `migration:generate` sees no difference. The schema itself only ever comes
 * from migrations (synchronize is off).
 */
@Entity('bookings')
@Check('bookings_period_not_empty', 'NOT isempty(period)')
@Check(
  'bookings_cancelled_at_matches_status',
  `(status = 'cancelled') = (cancelled_at IS NOT NULL)`,
)
@Check('bookings_status_valid', `status IN ('active', 'cancelled')`)
// No two active bookings of the same resource may overlap (BR3, BR4, BR7).
@Exclusion(
  'bookings_no_overlap',
  `USING gist (resource_id WITH =, period WITH &&) WHERE (status = 'active')`,
)
export class BookingEntity {
  @PrimaryColumn({
    type: 'text',
    collation: 'C',
    primaryKeyConstraintName: 'bookings_pkey',
  })
  id: string;

  @Column({ name: 'resource_id', type: 'text', collation: 'C' })
  resourceId: string;

  @ManyToOne(() => ResourceEntity, { nullable: false })
  @JoinColumn({
    name: 'resource_id',
    foreignKeyConstraintName: 'bookings_resource_id_fkey',
  })
  resource: ResourceEntity;

  /** Half-open '[start,end)'; int4range normalizes to that form (BR3). */
  @Column({ type: 'int4range' })
  period: string;

  @Column({ type: 'text', default: 'active' })
  status: BookingStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;
}
