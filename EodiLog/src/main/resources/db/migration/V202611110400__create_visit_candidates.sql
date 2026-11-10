-- 사진 방문 후보(명세 §6 visit-detections·visit-candidates, ERD visit_candidates). 후보는 실제 방문으로 집계하지 않는다
-- 요청자 본인 멤버십 후보만 만든다(사진 속 타인을 방문자로 지정하지 않음). 본인이 확정하면 visit과 연결된다
-- 사진 이동·삭제 시 미확정 후보는 INVALIDATED. 사진·방문을 물리 삭제하는 정리 작업이 링크·후보를 먼저 지운다
CREATE TABLE visit_candidates (
    id uuid PRIMARY KEY,
    job_id uuid NOT NULL REFERENCES jobs (id),
    trip_id uuid NOT NULL REFERENCES trips (id),
    member_id uuid NOT NULL REFERENCES trip_members (id),
    place_id uuid NOT NULL REFERENCES places (id),
    visited_at timestamp with time zone NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'INVALIDATED')),
    visit_id uuid UNIQUE REFERENCES visits (id),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT ck_visit_candidates_confirmed CHECK ((status = 'CONFIRMED') = (visit_id IS NOT NULL))
);

CREATE INDEX idx_visit_candidates_job ON visit_candidates (job_id);
CREATE INDEX idx_visit_candidates_trip_member_place ON visit_candidates (trip_id, member_id, place_id);
CREATE INDEX idx_visit_candidates_member ON visit_candidates (member_id);
CREATE INDEX idx_visit_candidates_place ON visit_candidates (place_id);

CREATE TABLE visit_candidate_photos (
    candidate_id uuid NOT NULL REFERENCES visit_candidates (id),
    photo_id uuid NOT NULL REFERENCES photos (id),
    PRIMARY KEY (candidate_id, photo_id)
);

CREATE INDEX idx_visit_candidate_photos_photo ON visit_candidate_photos (photo_id);
