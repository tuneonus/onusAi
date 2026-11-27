CREATE TABLE auth_login_attempts (
    scope_key text PRIMARY KEY,
    failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    window_started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_until timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT auth_login_attempts_scope_key_valid CHECK (scope_key ~ '^[0-9a-f]{64}$')
);

CREATE INDEX auth_login_attempts_locked_until_idx
    ON auth_login_attempts (locked_until) WHERE locked_until IS NOT NULL;

CREATE TRIGGER auth_login_attempts_set_updated_at
    BEFORE UPDATE ON auth_login_attempts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

