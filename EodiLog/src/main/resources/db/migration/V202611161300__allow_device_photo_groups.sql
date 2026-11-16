-- 휴대폰(온디바이스) 분류로 만든 묶음은 작업이 없다. source_job_id null이 휴대폰 묶음을 뜻한다
ALTER TABLE photo_groups ALTER COLUMN source_job_id DROP NOT NULL;
