CREATE TABLE photo_upload_batches (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL REFERENCES trips(id),
    created_by_member_id uuid NOT NULL REFERENCES trip_members(id),
    file_count integer NOT NULL CHECK (file_count BETWEEN 1 AND 50),
    registered_count integer NOT NULL DEFAULT 0 CHECK (registered_count >= 0 AND registered_count <= file_count),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL CHECK (expires_at > created_at)
);
CREATE INDEX idx_photo_batches_trip ON photo_upload_batches(trip_id);

-- Extend the already-deployed V202611061300 assets table; preserve IDs, keys, status and data.
ALTER TABLE assets
 ADD COLUMN upload_batch_id uuid REFERENCES photo_upload_batches(id),
 ADD COLUMN display_key varchar(500),
 ADD COLUMN display_content_type varchar(100),
 ADD COLUMN metadata_json jsonb,
 ADD COLUMN upload_expires_at timestamptz,
 ADD COLUMN expires_at timestamptz,
 ADD COLUMN original_cleaned_at timestamptz;
UPDATE assets SET display_key='display/' || id::text,
 upload_expires_at=created_at + interval '10 minutes', expires_at=created_at + interval '24 hours';
ALTER TABLE assets ALTER COLUMN display_key SET NOT NULL,
 ALTER COLUMN upload_expires_at SET NOT NULL, ALTER COLUMN expires_at SET NOT NULL,
 ADD CONSTRAINT uk_assets_display_key UNIQUE(display_key),
 ADD CONSTRAINT ck_assets_expiry CHECK(expires_at>=upload_expires_at AND upload_expires_at>created_at);
-- Defaults also keep legacy JPA/manual inserts compatible; newly-created API assets always set explicit deadlines.
ALTER TABLE assets ALTER COLUMN display_key SET DEFAULT ('display/' || gen_random_uuid()::text),
 ALTER COLUMN upload_expires_at SET DEFAULT (now()+interval '10 minutes'),
 ALTER COLUMN expires_at SET DEFAULT (now()+interval '24 hours');
CREATE INDEX idx_assets_cleanup ON assets(expires_at,status);
-- Do not reject historical user references that predate assets; enforce the FK for new writes.
ALTER TABLE users ADD CONSTRAINT fk_users_profile_asset FOREIGN KEY(profile_asset_id) REFERENCES assets(id) NOT VALID;
CREATE TABLE photos (
    id uuid PRIMARY KEY,
    batch_id uuid NOT NULL REFERENCES photo_upload_batches(id),
    trip_id uuid NOT NULL REFERENCES trips(id),
    uploader_member_id uuid NOT NULL REFERENCES trip_members(id),
    asset_id uuid NOT NULL UNIQUE REFERENCES assets(id),
    place_id uuid REFERENCES places(id),
    captured_at timestamptz,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL,
    deleted_at timestamptz
);
CREATE INDEX idx_photos_trip_cursor ON photos(trip_id, created_at DESC, id DESC);
