CREATE TABLE user_preference_states (
    user_id uuid PRIMARY KEY REFERENCES users(id),
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    places_fingerprint char(64) NOT NULL
);
CREATE TABLE user_preferences (
    user_id uuid NOT NULL REFERENCES users(id),
    key varchar(20) NOT NULL CHECK (length(trim(key)) BETWEEN 1 AND 20),
    value varchar(20) NOT NULL CHECK (value=key),
    source varchar(8) NOT NULL CHECK (source IN ('EXPLICIT','INFERRED')),
    position integer NOT NULL CHECK (position >= 0 AND position < 20),
    PRIMARY KEY(user_id,source,key),
    CHECK (source <> 'INFERRED' OR key IN ('바다','맛집','카페','산','도시','사진','산책','야경','휴식','골목'))
);
CREATE UNIQUE INDEX user_preferences_normalized_key ON user_preferences(user_id,lower(key));
CREATE TABLE user_preference_rejections (
    user_id uuid NOT NULL REFERENCES users(id),
    key varchar(20) NOT NULL CHECK (key IN ('바다','맛집','카페','산','도시','사진','산책','야경','휴식','골목')),
    PRIMARY KEY(user_id,key)
);
ALTER TABLE jobs DROP CONSTRAINT jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK (kind IN ('PLACE_EXTRACTION','TRIP_RECOMMENDATION','ITINERARY_PROPOSAL','WEATHER_ALTERNATIVES','CHECKLIST_SUGGESTIONS','PHOTO_CLASSIFICATION','VISIT_DETECTION','ROUTE_RECALCULATION','LEAVE_CLEANUP','PHOTO_DELETE','TRIP_DELETE','ACCOUNT_DELETE','PREFERENCE_INFERENCE'));
ALTER TABLE jobs DROP CONSTRAINT jobs_error_code_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_error_code_check CHECK (error_code IN ('TEMPORARY_FAILURE','TIMEOUT','EXECUTION_FAILED','POLICY_REVOKED','INSUFFICIENT_DATA'));
