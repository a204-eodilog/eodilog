-- 회원 경로별 피드 노출(EODI-258). 목록·지도를 SQL에서 거르고 키셋으로 나누도록 게시 스냅샷의 기간·지역·장소 지역을 열/표로 둔다.
-- 값은 게시 시점 스냅샷(snapshot_json)과 같으며 게시 후 바뀌지 않는다.
ALTER TABLE feeds ADD COLUMN start_date date, ADD COLUMN end_date date;
UPDATE feeds SET start_date=(snapshot_json->>'startDate')::date, end_date=(snapshot_json->>'endDate')::date;

-- 스냅샷 지역. 지도 마커와 지역별 목록의 기준
CREATE TABLE feed_regions (
 feed_id uuid NOT NULL REFERENCES feeds(id),
 region_id uuid NOT NULL REFERENCES regions(id),
 PRIMARY KEY(feed_id,region_id)
);
CREATE INDEX idx_feed_regions_region ON feed_regions(region_id,feed_id);
INSERT INTO feed_regions(feed_id,region_id)
SELECT DISTINCT f.id,(r->>'id')::uuid FROM feeds f CROSS JOIN LATERAL jsonb_array_elements(f.snapshot_json->'regions') r
WHERE EXISTS (SELECT 1 FROM regions g WHERE g.id=(r->>'id')::uuid);

-- 스냅샷 장소와 그 시점 지역. 방문 수를 마커와 같은 지역 기준으로 센다. 원본 장소 삭제와 무관하게 남긴다
CREATE TABLE feed_places (
 feed_id uuid NOT NULL REFERENCES feeds(id),
 place_id uuid NOT NULL,
 region_id uuid,
 PRIMARY KEY(feed_id,place_id)
);
INSERT INTO feed_places(feed_id,place_id,region_id)
SELECT DISTINCT ON (f.id,(p->>'id')::uuid) f.id,(p->>'id')::uuid,(p->>'regionId')::uuid
FROM feeds f CROSS JOIN LATERAL jsonb_array_elements(f.snapshot_json->'places') p;

-- 타임라인 키셋(시작일 DESC NULLS LAST, trip_id DESC)
CREATE INDEX idx_feeds_live_start ON feeds(start_date DESC NULLS LAST,trip_id DESC) WHERE deleted_at IS NULL;
