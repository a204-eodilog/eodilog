CREATE TABLE events (
    id uuid PRIMARY KEY,
    type varchar(64) NOT NULL,
    trip_id uuid REFERENCES trips(id),
    actor_user_id uuid REFERENCES users(id),
    target_type varchar(32) NOT NULL,
    target_id uuid NOT NULL,
    payload_json jsonb,
    deduplication_key varchar(255) NOT NULL UNIQUE,
    created_at timestamptz NOT NULL,
    published_at timestamptz
);

CREATE TABLE notifications (
    id uuid PRIMARY KEY,
    recipient_user_id uuid NOT NULL REFERENCES users(id),
    event_id uuid NOT NULL REFERENCES events(id),
    read_at timestamptz,
    dismissed_at timestamptz,
    created_at timestamptz NOT NULL,
    CONSTRAINT uk_notifications_recipient_event UNIQUE(recipient_user_id,event_id)
);

CREATE INDEX idx_notifications_recipient_page ON notifications(recipient_user_id,created_at DESC,id DESC);
CREATE INDEX idx_notifications_recipient_unread ON notifications(recipient_user_id,read_at,created_at DESC);
CREATE INDEX idx_events_trip ON events(trip_id);

ALTER TABLE messages ADD CONSTRAINT fk_messages_event_id FOREIGN KEY(event_id) REFERENCES events(id);

CREATE TABLE event_receipts (
    event_id uuid NOT NULL REFERENCES events(id),
    user_id uuid NOT NULL REFERENCES users(id),
    read_at timestamptz NOT NULL,
    PRIMARY KEY(event_id,user_id)
);
