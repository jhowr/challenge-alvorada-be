import { memoryTarget } from '../helpers/api-target.js';
import { bookingsApiSuite } from './bookings.api-suite.js';

bookingsApiSuite('memory', memoryTarget);
