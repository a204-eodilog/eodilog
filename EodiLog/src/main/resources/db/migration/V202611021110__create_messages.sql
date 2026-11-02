-- 여행 그룹 채팅 메시지(명세 §9). 방 안 순번(sequence)은 chat_rooms.next_sequence를 잠근 뒤 하나씩 발급한다
-- ACTIVE 멤버는 처음부터 전체 대화를 본다(Q-13, 2026-11-02 확정). 첨부·편집·삭제·읽음은 아직 없다
CREATE TABLE messages (
    id uuid PRIMARY KEY,
    room_id uuid NOT NULL REFERENCES chat_rooms (id),
    sender_user_id uuid REFERENCES users (id),
    type varchar(16) NOT NULL CHECK (type IN ('TEXT', 'SYSTEM')),
    sequence bigint NOT NULL CHECK (sequence >= 1),
    text text,
    client_message_id uuid,
    -- 시스템 카드가 가리키는 이벤트. events 테이블이 생길 때 FK를 건다
    event_id uuid,
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT uk_messages_room_sequence UNIQUE (room_id, sequence),
    -- 같은 보낸 사람의 clientMessageId는 한 번만 저장한다(재전송은 처음 메시지를 돌려준다)
    CONSTRAINT uk_messages_sender_client_message UNIQUE (sender_user_id, client_message_id),
    CONSTRAINT uk_messages_room_event UNIQUE (room_id, event_id),
    -- 일반 메시지는 보낸 사람·본문·clientMessageId가 있다
    CONSTRAINT ck_messages_text CHECK (type <> 'TEXT'
        OR (sender_user_id IS NOT NULL AND text IS NOT NULL AND client_message_id IS NOT NULL)),
    -- 시스템 카드는 이벤트를 가리키고 보낸 사람이 없다
    CONSTRAINT ck_messages_system CHECK (type <> 'SYSTEM' OR (event_id IS NOT NULL AND sender_user_id IS NULL))
);

CREATE INDEX idx_messages_sender_user_id ON messages (sender_user_id);
