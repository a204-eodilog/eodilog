CREATE TABLE personal_bookmarks (
    user_id uuid NOT NULL REFERENCES users (id),
    place_id uuid NOT NULL REFERENCES places (id),
    memo text,
    source_feed_id uuid,
    retained_place_name varchar(255) NOT NULL,
    retained_latitude numeric(10, 7) NOT NULL,
    retained_longitude numeric(10, 7) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    PRIMARY KEY (user_id, place_id)
);

CREATE INDEX idx_personal_bookmarks_recent
    ON personal_bookmarks (user_id, created_at DESC, place_id DESC);
