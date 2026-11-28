CREATE TABLE document_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL,
    business_id uuid NOT NULL,
    version_number integer NOT NULL,
    status text NOT NULL DEFAULT 'uploaded',
    source_filename text NOT NULL,
    mime_type text NOT NULL,
    source_type text NOT NULL,
    encoding text NOT NULL DEFAULT 'utf-8',
    byte_size integer NOT NULL,
    char_count integer NOT NULL,
    content_sha256 text NOT NULL,
    content_text text NOT NULL,
    failure_reason text NULL,
    indexed_at timestamptz NULL,
    created_by_user_id uuid NULL REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT document_versions_document_fk
        FOREIGN KEY (business_id, document_id)
        REFERENCES documents (business_id, id)
        ON DELETE CASCADE,
    CONSTRAINT document_versions_business_id_unique UNIQUE (business_id, id),
    CONSTRAINT document_versions_number_unique UNIQUE (document_id, version_number),
    CONSTRAINT document_versions_number_valid CHECK (version_number >= 1),
    CONSTRAINT document_versions_status_valid CHECK (
        status IN ('uploaded', 'processing', 'ready', 'failed', 'superseded', 'deleted')
    ),
    CONSTRAINT document_versions_source_filename_valid CHECK (
        source_filename = btrim(source_filename)
        AND char_length(source_filename) BETWEEN 1 AND 255
        AND source_filename !~ '[/\\]'
    ),
    CONSTRAINT document_versions_mime_type_valid CHECK (
        mime_type IN ('text/plain', 'text/markdown')
    ),
    CONSTRAINT document_versions_source_type_valid CHECK (
        source_type IN ('txt', 'markdown')
    ),
    CONSTRAINT document_versions_encoding_valid CHECK (encoding = 'utf-8'),
    CONSTRAINT document_versions_byte_size_valid CHECK (
        byte_size >= 1 AND byte_size <= 1048576
    ),
    CONSTRAINT document_versions_char_count_valid CHECK (char_count >= 1),
    CONSTRAINT document_versions_sha256_valid CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT document_versions_content_text_valid CHECK (
        char_length(content_text) >= 1
        AND octet_length(content_text) <= 1048576
        AND content_text ~ '[^[:space:]]'
    ),
    CONSTRAINT document_versions_failure_reason_valid CHECK (
        failure_reason IS NULL OR (
            failure_reason = btrim(failure_reason)
            AND char_length(failure_reason) BETWEEN 1 AND 500
            AND failure_reason ~ '[^[:space:]]'
        )
    ),
    CONSTRAINT document_versions_indexed_state_valid CHECK (
        (status IN ('uploaded', 'processing', 'failed') AND indexed_at IS NULL)
        OR (status = 'ready' AND indexed_at IS NOT NULL)
        OR status IN ('superseded', 'deleted')
    )
);

CREATE UNIQUE INDEX document_versions_one_pending_idx
    ON document_versions (document_id)
    WHERE status IN ('uploaded', 'processing');

CREATE UNIQUE INDEX document_versions_one_ready_idx
    ON document_versions (document_id)
    WHERE status = 'ready';

CREATE INDEX document_versions_business_document_idx
    ON document_versions (business_id, document_id, version_number DESC);

ALTER TABLE documents
    ADD CONSTRAINT documents_active_version_fk
    FOREIGN KEY (business_id, active_version_id)
    REFERENCES document_versions (business_id, id)
    ON DELETE SET NULL;

CREATE TRIGGER document_versions_set_updated_at
    BEFORE UPDATE ON document_versions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION enforce_document_version_transitions() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (
        NEW.document_id <> OLD.document_id
        OR NEW.business_id <> OLD.business_id
        OR NEW.version_number <> OLD.version_number
        OR NEW.source_filename <> OLD.source_filename
        OR NEW.mime_type <> OLD.mime_type
        OR NEW.source_type <> OLD.source_type
        OR NEW.encoding <> OLD.encoding
        OR NEW.byte_size <> OLD.byte_size
        OR NEW.char_count <> OLD.char_count
        OR NEW.content_sha256 <> OLD.content_sha256
        OR NEW.content_text <> OLD.content_text
        OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
        OR NEW.created_at <> OLD.created_at
    ) THEN
        RAISE EXCEPTION 'Document version content and source metadata are immutable.'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.status <> OLD.status THEN
        IF NOT (
            (OLD.status = 'uploaded' AND NEW.status IN ('processing', 'failed', 'superseded', 'deleted'))
            OR (OLD.status = 'processing' AND NEW.status IN ('ready', 'failed', 'deleted'))
            OR (OLD.status = 'failed' AND NEW.status IN ('uploaded', 'superseded', 'deleted'))
            OR (OLD.status = 'ready' AND NEW.status IN ('superseded', 'deleted'))
            OR (OLD.status = 'superseded' AND NEW.status = 'deleted')
        ) THEN
            RAISE EXCEPTION 'Invalid document version state transition.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER document_versions_transition_guard
    BEFORE UPDATE ON document_versions
    FOR EACH ROW EXECUTE FUNCTION enforce_document_version_transitions();

