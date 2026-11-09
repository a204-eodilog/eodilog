-- 직전 AI 코스 적용 이전의 코스 한 벌(EODI-231, 정책 I-19·I-21). 코스당 한 행만 두고 새 적용이 덮어쓴다
-- 적용 뒤 다른 쓰기가 생기면 version이 달라져 되돌릴 수 없다. 되돌리면 행을 지운다
CREATE TABLE itinerary_undo_states (
    itinerary_id uuid PRIMARY KEY REFERENCES itineraries (id),
    applied_job_id uuid NOT NULL REFERENCES jobs (id),
    -- 적용으로 오른 코스 version. 현재 version과 같을 때만 되돌릴 수 있다
    applied_version bigint NOT NULL CHECK (applied_version > 0),
    -- 적용 전 코스 {items:[...], legs:[...]}. 항목 ID까지 그대로 복원한다
    before_content_json jsonb NOT NULL CHECK (jsonb_typeof(before_content_json) = 'object'),
    applied_by_member_id uuid NOT NULL REFERENCES trip_members (id),
    created_at timestamp with time zone NOT NULL
);

-- AI 코스 제안은 이동 시간만 주고 거리·지도선은 비운다(AI spec §5, 정책 I-28)
-- AVAILABLE은 이동 시간이 있다는 뜻으로 넓힌다. UNAVAILABLE은 여전히 시간·거리·지도선이 모두 비어 있어야 한다
ALTER TABLE route_legs DROP CONSTRAINT ck_route_legs_result;
ALTER TABLE route_legs ADD CONSTRAINT ck_route_legs_result CHECK (
    (status = 'AVAILABLE' AND duration_seconds IS NOT NULL)
    OR (status = 'UNAVAILABLE' AND duration_seconds IS NULL AND distance_meters IS NULL AND geometry_json IS NULL));
