CREATE TABLE documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    location_id uuid NULL,
    title text NOT NULL,
    visibility text NOT NULL DEFAULT 'public',
    status text NOT NULL DEFAULT 'uploaded',
    current_version_number integer NOT NULL DEFAULT 1,
    active_version_id uuid NULL,
    created_by_user_id uuid NULL REFERENCES users (id) ON DELETE SET NULL,
    deleted_at timestamptz NULL,
    deleted_by_user_id uuid NULL REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT documents_business_id_unique UNIQUE (business_id, id),
    CONSTRAINT documents_business_location_fk
        FOREIGN KEY (business_id, location_id)
        REFERENCES business_locations (business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT documents_title_valid CHECK (
        title = btrim(title)
        AND char_length(title) BETWEEN 1 AND 200
        AND title ~ '[^[:space:]]'
    ),
    CONSTRAINT documents_visibility_valid CHECK (visibility IN ('public', 'staff_only')),
    CONSTRAINT documents_status_valid CHECK (
        status IN ('uploaded', 'processing', 'ready', 'failed', 'deleted')
    ),
    CONSTRAINT documents_current_version_number_valid CHECK (current_version_number >= 1),
    CONSTRAINT documents_deleted_state_valid CHECK (
        (status = 'deleted' AND deleted_at IS NOT NULL)
        OR (status <> 'deleted' AND deleted_at IS NULL)
    ),
    CONSTRAINT documents_active_version_only_when_ready CHECK (
        active_version_id IS NULL OR status IN ('ready', 'processing', 'failed')
    )
);

CREATE INDEX documents_business_active_idx
    ON documents (business_id, updated_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX documents_business_visibility_idx
    ON documents (business_id, visibility, status)
    WHERE deleted_at IS NULL;

CREATE INDEX documents_business_location_idx
    ON documents (business_id, location_id)
    WHERE location_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER documents_set_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

