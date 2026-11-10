CREATE TABLE feeds (
 id uuid PRIMARY KEY,
 trip_id uuid NOT NULL REFERENCES trips(id),
 title text NOT NULL CHECK (btrim(title) <> ''),
 body text NOT NULL,
 published_at timestamptz NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
 snapshot_json jsonb NOT NULL,
 deleted_at timestamptz
);
CREATE UNIQUE INDEX uk_feeds_current_trip ON feeds(trip_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_feeds_published ON feeds(published_at DESC,id DESC) WHERE deleted_at IS NULL;
-- Snapshot references deliberately outlive physical original deletion.
CREATE TABLE feed_photos (
 feed_id uuid NOT NULL REFERENCES feeds(id),
 photo_id uuid NOT NULL,
 asset_id uuid NOT NULL,
 PRIMARY KEY(feed_id,photo_id)
);
CREATE TABLE feed_visibilities (
 feed_id uuid NOT NULL REFERENCES feeds(id),
 user_id uuid NOT NULL REFERENCES users(id),
 hidden_viewer_user_ids jsonb NOT NULL DEFAULT '[]',
 version bigint NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(feed_id,user_id)
);
