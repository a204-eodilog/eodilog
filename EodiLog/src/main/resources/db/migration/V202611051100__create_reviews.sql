-- 방문 평가(명세 §7, ERD reviews). 방문 하나당 평가 하나이고 작성자는 visits.member_id로 안다
-- 삭제는 물리 삭제라 visit_id 유일 제약을 그대로 둔다. 본문 길이 상한(1,000자, 코드 포인트)은 서비스가 검사한다
CREATE TABLE reviews (
    id uuid PRIMARY KEY,
    visit_id uuid NOT NULL UNIQUE REFERENCES visits (id),
    score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
    body text NOT NULL CHECK (btrim(body) <> ''),
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);
