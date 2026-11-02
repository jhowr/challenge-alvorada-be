-- Lets a GiST index combine equality on text with range overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- COLLATE "C" makes ORDER BY id compare bytes, matching the API's id order
-- regardless of the server's default locale (BR13).
CREATE TABLE resources (
  id text COLLATE "C" PRIMARY KEY
);

CREATE TABLE bookings (
  -- Cancelled bookings keep their row, so the primary key alone guarantees
  -- that an id is never reused (BR6).
  id           text COLLATE "C" PRIMARY KEY,
  resource_id  text COLLATE "C" NOT NULL REFERENCES resources (id),
  -- int4range normalizes to '[)', the half-open period of BR3.
  period       int4range NOT NULL,
  status       text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CHECK (NOT isempty(period)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  -- No two active bookings of the same resource may overlap (BR3, BR4, BR7),
  -- enforced by the database even under concurrent inserts.
  CONSTRAINT bookings_no_overlap
    EXCLUDE USING gist (resource_id WITH =, period WITH &&)
    WHERE (status = 'active')
);
