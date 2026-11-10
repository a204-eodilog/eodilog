-- 공동 피드 '내 기록까지 삭제'(EODI-257) 정리 작업 종류. 정리 작업이므로 고정 대상(cleanup_scope_json)이 필수다
ALTER TABLE jobs DROP CONSTRAINT jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK (kind IN ('PLACE_EXTRACTION','TRIP_RECOMMENDATION','ITINERARY_PROPOSAL','WEATHER_ALTERNATIVES','CHECKLIST_SUGGESTIONS','PHOTO_CLASSIFICATION','VISIT_DETECTION','ROUTE_RECALCULATION','LEAVE_CLEANUP','PHOTO_DELETE','TRIP_DELETE','ACCOUNT_DELETE','PREFERENCE_INFERENCE','OWN_RECORDS_DELETE'));
-- 정리 작업 대상 검사는 이름 없이 만들어져 자동 이름이 붙었다. 정의로 찾아 지우고 이름을 붙여 다시 만든다
DO $$
DECLARE
    found text;
BEGIN
    SELECT conname INTO STRICT found FROM pg_constraint
    WHERE conrelid = 'jobs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%cleanup_scope_json IS NOT NULL%';
    EXECUTE format('ALTER TABLE jobs DROP CONSTRAINT %I', found);
END
$$;
ALTER TABLE jobs ADD CONSTRAINT jobs_cleanup_scope_check
    CHECK ((kind IN ('LEAVE_CLEANUP','PHOTO_DELETE','TRIP_DELETE','ACCOUNT_DELETE','OWN_RECORDS_DELETE')) = (cleanup_scope_json IS NOT NULL));
