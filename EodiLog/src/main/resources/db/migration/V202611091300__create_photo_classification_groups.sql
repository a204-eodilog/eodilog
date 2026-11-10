CREATE TABLE photo_groups (
 id uuid PRIMARY KEY,
 trip_id uuid NOT NULL REFERENCES trips(id),
 source_job_id uuid NOT NULL REFERENCES jobs(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,trip_id)
);
ALTER TABLE photos ADD COLUMN group_id uuid,
 ADD CONSTRAINT fk_photos_group_trip FOREIGN KEY(group_id,trip_id) REFERENCES photo_groups(id,trip_id);
CREATE INDEX idx_photos_group ON photos(group_id) WHERE deleted_at IS NULL;
-- No photo/member FK: deletion must not erase the durable replay receipt.
CREATE TABLE photo_classification_applies (
 job_id uuid PRIMARY KEY REFERENCES jobs(id),
 request_json jsonb NOT NULL,
 response_json jsonb NOT NULL
);
