CREATE TABLE jobs (
    id uuid PRIMARY KEY,
    requested_by_user_id uuid NOT NULL REFERENCES users(id),
    trip_id uuid REFERENCES trips(id),
    kind varchar(40) NOT NULL CHECK (kind IN ('PLACE_EXTRACTION','TRIP_RECOMMENDATION','ITINERARY_PROPOSAL','WEATHER_ALTERNATIVES','CHECKLIST_SUGGESTIONS','PHOTO_CLASSIFICATION','VISIT_DETECTION','ROUTE_RECALCULATION','LEAVE_CLEANUP','PHOTO_DELETE','TRIP_DELETE','ACCOUNT_DELETE')),
    status varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
    progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    input_json jsonb NOT NULL CHECK (jsonb_typeof(input_json) = 'object'),
    cleanup_scope_json jsonb,
    result_json jsonb CHECK (result_json IS NULL OR jsonb_typeof(result_json) = 'object'),
    error_code varchar(64) CHECK (error_code IN ('TEMPORARY_FAILURE','TIMEOUT','EXECUTION_FAILED','POLICY_REVOKED')),
    base_version bigint CHECK (base_version > 0),
    applied_by_member_id uuid REFERENCES trip_members(id),
    applied_at timestamptz,
    attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
    execution_id uuid,
    execution_started_at timestamptz,
    lease_until timestamptz,
    heartbeat_at timestamptz,
    next_attempt_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    finished_at timestamptz,
    deleted_at timestamptz,
    CHECK ((status = 'RUNNING') = (execution_id IS NOT NULL AND lease_until IS NOT NULL)),
    CHECK ((status IN ('SUCCEEDED','FAILED','CANCELLED')) = (finished_at IS NOT NULL)),
    CHECK ((kind IN ('LEAVE_CLEANUP','PHOTO_DELETE','TRIP_DELETE','ACCOUNT_DELETE')) = (cleanup_scope_json IS NOT NULL))
);
CREATE INDEX jobs_queued_claim_idx ON jobs(next_attempt_at, created_at, id) WHERE status = 'QUEUED' AND deleted_at IS NULL;
CREATE INDEX jobs_expired_lease_idx ON jobs(lease_until) WHERE status = 'RUNNING' AND deleted_at IS NULL;
CREATE INDEX jobs_trip_kind_created_idx ON jobs(trip_id, kind, created_at);
