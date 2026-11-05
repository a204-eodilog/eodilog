-- 마감 1시간 전 알림(POLL_REMINDER)을 보낸 시각. 주기 작업이 아직 보내지 않은 OPEN 투표만 찾으므로 부분 인덱스로 둔다
ALTER TABLE polls ADD COLUMN reminder_sent_at timestamp with time zone;

CREATE INDEX idx_polls_reminder_due ON polls (closes_at) WHERE status = 'OPEN' AND reminder_sent_at IS NULL;
