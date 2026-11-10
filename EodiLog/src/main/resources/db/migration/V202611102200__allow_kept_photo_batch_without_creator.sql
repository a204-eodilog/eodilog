-- A photo moved to another trip keeps its upload-time batch (spec §8). When the source trip is deleted, that batch
-- survives as provenance while the source memberships are removed, so its creator reference is cleared.
ALTER TABLE photo_upload_batches ALTER COLUMN created_by_member_id DROP NOT NULL;
