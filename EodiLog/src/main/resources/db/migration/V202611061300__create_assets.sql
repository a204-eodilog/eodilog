-- 업로드한 파일 하나(명세 §7). 파일 바이트는 S3에 두고 DB에는 객체 키만 둔다(ADR-0001). 영구 공개 URL은 저장하지 않는다
-- 업로드 요청 때 PENDING으로 만들고, 앱이 서명 URL로 올린 뒤 complete가 크기·실제 형식을 확인해 READY로 바꾼다
-- PENDING 취소는 CANCELLED. DELETING/DELETED는 사진 삭제 작업이 쓴다
-- upload_batch_id(사진 묶음)와 metadata_json(EXIF)은 사진 등록 작업에서 추가한다
CREATE TABLE assets (
    id uuid PRIMARY KEY,
    owner_user_id uuid NOT NULL REFERENCES users (id),
    trip_id uuid REFERENCES trips (id),
    purpose varchar(16) NOT NULL CHECK (purpose IN ('PROFILE', 'CAPTURE', 'TRIP_PHOTO')),
    object_key varchar(500) NOT NULL UNIQUE,
    content_type varchar(100) NOT NULL,
    byte_size bigint NOT NULL CHECK (byte_size > 0),
    status varchar(16) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'READY', 'DELETING', 'DELETED', 'CANCELLED')),
    created_at timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone,
    -- 여행 사진만 여행에 묶인다
    CONSTRAINT ck_assets_trip_purpose CHECK ((purpose = 'TRIP_PHOTO') = (trip_id IS NOT NULL))
);

CREATE INDEX idx_assets_owner_user_id ON assets (owner_user_id);
CREATE INDEX idx_assets_trip_id ON assets (trip_id);
-- 오래된 PENDING(올리다 만 업로드) 정리용
CREATE INDEX idx_assets_pending_created ON assets (created_at) WHERE status = 'PENDING';
