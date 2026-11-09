-- AI 준비물 제안 채택(EODI-218). 채택한 항목은 원본 작업과 제안 순번을 함께 가진다
-- 같은 제안(작업·순번)은 한 번만 채택한다. 채택 후 지운 행도 남아 있으므로 지운 제안을 다시 채택해 되살리지 못한다
ALTER TABLE checklist_items ADD COLUMN suggestion_index integer CHECK (suggestion_index >= 0);

ALTER TABLE checklist_items
    ADD CONSTRAINT ck_checklist_items_suggestion_index CHECK ((source = 'AI') = (suggestion_index IS NOT NULL));

-- 정책 C-1: jobs 테이블이 생기면 원본 작업 FK를 건다. 여행 삭제(TRIP_DELETE)는 준비물을 지우고 jobs 행은 남기므로 막히지 않는다
ALTER TABLE checklist_items
    ADD CONSTRAINT fk_checklist_items_source_job FOREIGN KEY (source_job_id) REFERENCES jobs (id);

ALTER TABLE checklist_items
    ADD CONSTRAINT uk_checklist_items_source_suggestion UNIQUE (source_job_id, suggestion_index);
