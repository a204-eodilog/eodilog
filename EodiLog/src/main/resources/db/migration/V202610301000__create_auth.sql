CREATE TABLE oauth_accounts (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 provider varchar(16) NOT NULL CHECK (provider IN ('KAKAO','NAVER')),
 provider_user_id varchar(255) NOT NULL,
 created_at timestamp with time zone NOT NULL,
 UNIQUE(provider,provider_user_id)
);
CREATE INDEX oauth_accounts_user_idx ON oauth_accounts(user_id);
CREATE TABLE oauth_attempts (
 id uuid PRIMARY KEY,
 provider varchar(16) NOT NULL,
 state_hash varchar(255) NOT NULL UNIQUE,
 initiator_context_hash varchar(255) NOT NULL,
 redirect_uri varchar(500) NOT NULL,
 code_challenge varchar(43) NOT NULL,
 expires_at timestamp with time zone NOT NULL,
 consumed_at timestamp with time zone,
 created_at timestamp with time zone NOT NULL
);
CREATE TABLE sessions (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 refresh_token_hash varchar(255) NOT NULL UNIQUE,
 rotated_from_id uuid REFERENCES sessions(id),
 expires_at timestamp with time zone NOT NULL,
 revoked_at timestamp with time zone,
 created_at timestamp with time zone NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
