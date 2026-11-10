ALTER TABLE photos ADD COLUMN place_manually_edited boolean NOT NULL DEFAULT false,
 ADD COLUMN topics_manually_edited boolean NOT NULL DEFAULT false;
-- DELETING hides an asset at approval; it no longer means external deletion succeeded.
ALTER TABLE assets ADD COLUMN objects_deleted boolean NOT NULL DEFAULT false;
CREATE TABLE photo_topics (
 photo_id uuid NOT NULL REFERENCES photos(id),
 topic varchar(64) NOT NULL CHECK (topic IN ('LANDSCAPE','FOOD','PEOPLE','OTHER')),
 source varchar(16) NOT NULL CHECK (source IN ('AI','MANUAL')),
 PRIMARY KEY(photo_id,topic)
);
CREATE INDEX idx_photo_topics_topic ON photo_topics(topic,photo_id);
-- Durable receipt has no photo/asset/member FK: retries still resolve after physical cleanup.
CREATE TABLE photo_delete_requests (
 photo_id uuid PRIMARY KEY,
 trip_id uuid NOT NULL REFERENCES trips(id),
 requested_by_user_id uuid NOT NULL REFERENCES users(id),
 job_id uuid NOT NULL UNIQUE REFERENCES jobs(id)
);
