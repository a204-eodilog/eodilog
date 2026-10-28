CREATE TABLE users (
 id uuid PRIMARY KEY,
 nickname varchar(50) NOT NULL,
 profile_completed boolean NOT NULL DEFAULT false,
 account_visibility varchar(16) NOT NULL DEFAULT 'PRIVATE' CHECK (account_visibility IN ('PUBLIC','PRIVATE')),
 profile_asset_id uuid,
 age_band varchar(32),
 age_use_consent boolean NOT NULL DEFAULT false,
 inference_consent boolean NOT NULL DEFAULT false,
 preference_sharing_scope varchar(32) NOT NULL DEFAULT 'NONE',
 status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DEACTIVATED')),
 created_at timestamp with time zone NOT NULL,
 updated_at timestamp with time zone NOT NULL,
 deactivated_at timestamp with time zone,
 CHECK ((profile_completed AND length(trim(nickname)) BETWEEN 1 AND 50) OR (NOT profile_completed AND nickname=''))
);
