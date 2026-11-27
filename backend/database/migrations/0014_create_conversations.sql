ALTER TABLE assistant_versions
    ADD CONSTRAINT assistant_versions_assistant_id_unique UNIQUE (assistant_id, id);

CREATE TABLE conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    location_id uuid NULL,
    assistant_id uuid NOT NULL,
    assistant_version_id uuid NOT NULL,
    channel text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_by_user_id uuid NULL REFERENCES users (id) ON DELETE SET NULL,
    idempotency_key text NULL,
    message_count integer NOT NULL DEFAULT 0,
    last_message_at timestamptz NULL,
    retain_until timestamptz NOT NULL,
    deleted_at timestamptz NULL,
    deleted_by_user_id uuid NULL REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT conversations_business_id_unique UNIQUE (business_id, id),
    CONSTRAINT conversations_business_location_fk
        FOREIGN KEY (business_id, location_id)
        REFERENCES business_locations (business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT conversations_business_assistant_fk
        FOREIGN KEY (business_id, assistant_id)
        REFERENCES assistants (business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT conversations_business_assistant_version_fk
        FOREIGN KEY (business_id, assistant_version_id)
        REFERENCES assistant_versions (business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT conversations_assistant_version_pair_fk
        FOREIGN KEY (assistant_id, assistant_version_id)
        REFERENCES assistant_versions (assistant_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT conversations_channel_valid CHECK (channel IN ('playground', 'visitor')),
    CONSTRAINT conversations_status_valid CHECK (
        status IN ('active', 'pending_human', 'human_active', 'closed')
    ),
    CONSTRAINT conversations_idempotency_key_valid CHECK (
        idempotency_key IS NULL OR (
            idempotency_key = btrim(idempotency_key)
            AND char_length(idempotency_key) BETWEEN 1 AND 128
            AND idempotency_key ~ '[^[:space:]]'
        )
    ),
    CONSTRAINT conversations_message_count_valid CHECK (message_count >= 0),
    CONSTRAINT conversations_retain_until_valid CHECK (retain_until > created_at)
);

CREATE INDEX conversations_business_active_idx
    ON conversations (business_id, COALESCE(last_message_at, created_at) DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX conversations_business_channel_status_idx
    ON conversations (business_id, channel, status)
    WHERE deleted_at IS NULL;

CREATE INDEX conversations_retain_until_idx
    ON conversations (retain_until)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX conversations_idempotency_unique
    ON conversations (business_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER conversations_set_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
