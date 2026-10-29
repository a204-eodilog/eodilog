-- 여행당 공동 준비물 목록 하나. 모든 ACTIVE 멤버가 추가·수정·체크·삭제한다(명세 §6)
-- 삭제는 deleted_at으로 남겨 AI 재제안이 지운 항목을 되살리지 않게 한다
-- created_by·checked_by 멤버가 같은 여행 소속인지는 서비스가 보장한다(요청자의 ACTIVE 멤버십만 기록)
CREATE TABLE checklist_items (
    id uuid PRIMARY KEY,
    trip_id uuid NOT NULL REFERENCES trips (id),
    label varchar(255) NOT NULL CHECK (btrim(label) <> ''),
    checked boolean NOT NULL DEFAULT false,
    source varchar(16) NOT NULL CHECK (source IN ('MANUAL', 'AI')),
    -- jobs 테이블이 생길 때 FK를 추가한다
    source_job_id uuid,
    reason text,
    modified_by_user boolean NOT NULL DEFAULT false,
    created_by_member_id uuid NOT NULL REFERENCES trip_members (id),
    checked_by_member_id uuid REFERENCES trip_members (id),
    checked_at timestamp with time zone,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    -- AI 제안에서 채택한 항목만 원본 작업을 가진다
    CONSTRAINT ck_checklist_items_source_job CHECK ((source = 'AI') = (source_job_id IS NOT NULL)),
    -- 체크하면 체크한 멤버·시각이 함께 있고, 해제하면 둘 다 없다
    CONSTRAINT ck_checklist_items_checked CHECK (
        (checked AND checked_by_member_id IS NOT NULL AND checked_at IS NOT NULL)
        OR (NOT checked AND checked_by_member_id IS NULL AND checked_at IS NULL))
);

CREATE INDEX idx_checklist_items_trip_created ON checklist_items (trip_id, created_at, id) WHERE deleted_at IS NULL;
