-- 투표를 연 사람이 마감 시각 전에 직접 종료할 수 있다(EODI-360, 정책 §13 V-16)
-- 결과 규칙(closed_reason·ck_polls_state)은 시각 마감과 같다. 누가 종료했는지만 남기고, 서버 자동 마감은 null이다
ALTER TABLE polls
    ADD COLUMN closed_by_member_id uuid REFERENCES trip_members (id);

ALTER TABLE polls
    ADD CONSTRAINT ck_polls_closed_by CHECK (closed_by_member_id IS NULL OR status <> 'OPEN');
