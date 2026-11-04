CREATE TABLE user_settings (
    user_id uuid PRIMARY KEY REFERENCES users (id),
    photo_classification_mode varchar(16) NOT NULL DEFAULT 'CONFIRM' CHECK (photo_classification_mode IN ('AUTO', 'CONFIRM', 'OFF')),
    visit_detection_mode varchar(16) NOT NULL DEFAULT 'CONFIRM' CHECK (visit_detection_mode IN ('AUTO', 'CONFIRM', 'OFF')),
    extraction_mode varchar(16) NOT NULL DEFAULT 'CONFIRM' CHECK (extraction_mode IN ('AUTO', 'CONFIRM', 'OFF')),
    checklist_mode varchar(16) NOT NULL DEFAULT 'CONFIRM' CHECK (checklist_mode IN ('AUTO', 'CONFIRM', 'OFF')),
    weather_mode varchar(16) NOT NULL DEFAULT 'SUGGEST_ONLY' CHECK (weather_mode IN ('SUGGEST_ONLY', 'OFF')),
    follow_requests_enabled boolean NOT NULL DEFAULT true,
    vote_course_enabled boolean NOT NULL DEFAULT true,
    trip_changes_enabled boolean NOT NULL DEFAULT true,
    version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
