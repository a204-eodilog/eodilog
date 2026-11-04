-- 실제 방문 기록(명세 §6, 정책 §16). '다녀옴' 수동 체크(MANUAL)와 나중의 사진 후보 확인(PHOTO)으로 만든다
-- 자동 위치 수집은 하지 않는다. 계획(itinerary_items)과 따로 집계한다. 방문자가 같은 여행 멤버십인지는 서비스가 보장한다
-- 체크 해제는 deleted_at으로 남기고, 다시 체크하면 새 행을 만든다. 나가도 방문 기록은 남는다
CREATE TABLE visits (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL REFERENCES trips (id),
    member_id uuid NOT NULL REFERENCES trip_members (id),
    place_id uuid NOT NULL REFERENCES places (id),
    visited_at timestamp with time zone NOT NULL,
    evidence_type varchar(16) NOT NULL DEFAULT 'MANUAL' CHECK (evidence_type IN ('MANUAL', 'PHOTO')),
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);

-- 여행·멤버·장소당 지우지 않은 방문은 하나다(VS-1). 다시 체크하면 기존 방문을 돌려준다
CREATE UNIQUE INDEX uk_visits_active_member_place ON visits (trip_id, member_id, place_id) WHERE deleted_at IS NULL;
-- 목록: 멤버별 최근 등록 순(createdAt DESC, id DESC)
CREATE INDEX idx_visits_trip_member_created ON visits (trip_id, member_id, created_at, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_visits_place_id ON visits (place_id);
