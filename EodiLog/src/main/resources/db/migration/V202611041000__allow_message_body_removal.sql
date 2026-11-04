-- 나가기 '내 채팅 삭제'(D-10, LEAVE_CLEANUP)는 메시지 행과 순번은 남기고 본문만 지운다
-- 지운 TEXT 메시지는 text NULL + deleted_at, 지운 메시지는 본문을 갖지 않는다
ALTER TABLE messages DROP CONSTRAINT ck_messages_text;
ALTER TABLE messages ADD CONSTRAINT ck_messages_text CHECK (type <> 'TEXT'
    OR (sender_user_id IS NOT NULL AND client_message_id IS NOT NULL AND (text IS NOT NULL OR deleted_at IS NOT NULL)));
ALTER TABLE messages ADD CONSTRAINT ck_messages_deleted_body CHECK (deleted_at IS NULL OR text IS NULL);
