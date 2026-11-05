CREATE TABLE trip_place_saves (
    trip_id uuid NOT NULL REFERENCES trips (id),
    place_id uuid NOT NULL REFERENCES places (id),
    saved_by_member_id uuid NOT NULL REFERENCES trip_members (id) ON DELETE CASCADE,
    memo text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    PRIMARY KEY (trip_id, place_id, saved_by_member_id)
);

CREATE INDEX idx_trip_place_saves_member
    ON trip_place_saves (trip_id, saved_by_member_id, place_id);
