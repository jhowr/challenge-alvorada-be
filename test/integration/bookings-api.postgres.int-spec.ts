import { bookingsApiSuite } from '../e2e/bookings.api-suite.js';
import { postgresTarget } from '../helpers/api-target.js';

bookingsApiSuite('postgres', postgresTarget);
