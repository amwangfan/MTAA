CREATE TABLE app.ai_operation_leases (
  lease_id uuid PRIMARY KEY,
  visitor_id uuid NOT NULL UNIQUE,
  slot_no integer NOT NULL UNIQUE,
  operation text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX ai_operation_leases_expires_at_idx ON app.ai_operation_leases (expires_at);
