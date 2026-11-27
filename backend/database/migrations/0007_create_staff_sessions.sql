CREATE TABLE staff_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    csrf_token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz NULL,
    last_seen_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT staff_sessions_token_hash_valid CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT staff_sessions_csrf_token_hash_valid CHECK (csrf_token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT staff_sessions_expiry_valid CHECK (expires_at > created_at)
);

CREATE INDEX staff_sessions_user_id_idx ON staff_sessions (user_id);

CREATE INDEX staff_sessions_active_expires_at_idx
    ON staff_sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TRIGGER staff_sessions_set_updated_at
    BEFORE UPDATE ON staff_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

