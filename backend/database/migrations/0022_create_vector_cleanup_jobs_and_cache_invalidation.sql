CREATE TABLE vector_cleanup_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    document_id uuid NOT NULL,
    document_version_id uuid NULL,
    qdrant_collection text NULL,
    job_type text NOT NULL,
    payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'queued',
    attempt_count integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5,
    next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_token uuid NULL,
    leased_by text NULL,
    leased_at timestamptz NULL,
    lease_expires_at timestamptz NULL,
    last_error text NULL,
    completed_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT vector_cleanup_jobs_document_fk
        FOREIGN KEY (business_id, document_id)
        REFERENCES documents (business_id, id)
        ON DELETE CASCADE,
    CONSTRAINT vector_cleanup_jobs_type_valid CHECK (
        job_type IN ('delete_document', 'delete_version', 'sync_metadata')
    ),
    CONSTRAINT vector_cleanup_jobs_status_valid CHECK (
        status IN ('queued', 'leased', 'completed', 'failed')
    ),
    CONSTRAINT vector_cleanup_jobs_attempt_count_valid CHECK (attempt_count >= 0),
    CONSTRAINT vector_cleanup_jobs_max_attempts_valid CHECK (max_attempts BETWEEN 1 AND 10),
    CONSTRAINT vector_cleanup_jobs_attempt_bounds CHECK (attempt_count <= max_attempts),
    CONSTRAINT vector_cleanup_jobs_collection_valid CHECK (
        qdrant_collection IS NULL OR (
            qdrant_collection = btrim(qdrant_collection)
            AND char_length(qdrant_collection) BETWEEN 1 AND 160
            AND qdrant_collection ~ '^[A-Za-z0-9_-]+$'
        )
    ),
    CONSTRAINT vector_cleanup_jobs_lease_state_valid CHECK (
        (
            status = 'leased'
            AND lease_token IS NOT NULL
            AND leased_by IS NOT NULL
            AND leased_at IS NOT NULL
            AND lease_expires_at IS NOT NULL
        )
        OR (
            status <> 'leased'
            AND lease_token IS NULL
            AND lease_expires_at IS NULL
        )
    ),
    CONSTRAINT vector_cleanup_jobs_completed_state_valid CHECK (
        (status = 'completed' AND completed_at IS NOT NULL)
        OR (status <> 'completed' AND completed_at IS NULL)
    )
);

CREATE INDEX vector_cleanup_jobs_poll_idx
    ON vector_cleanup_jobs (next_attempt_at ASC, created_at ASC)
    WHERE status = 'queued';

CREATE INDEX vector_cleanup_jobs_expired_lease_idx
    ON vector_cleanup_jobs (lease_expires_at ASC)
    WHERE status = 'leased';

CREATE INDEX vector_cleanup_jobs_business_doc_idx
    ON vector_cleanup_jobs (business_id, document_id, created_at DESC);

CREATE TRIGGER vector_cleanup_jobs_set_updated_at
    BEFORE UPDATE ON vector_cleanup_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE business_knowledge_versions (
    business_id uuid PRIMARY KEY REFERENCES businesses (id) ON DELETE CASCADE,
    knowledge_epoch bigint NOT NULL DEFAULT 1,
    last_invalidated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_reason text NOT NULL DEFAULT 'initialized',
    CONSTRAINT business_knowledge_versions_epoch_valid CHECK (knowledge_epoch >= 1),
    CONSTRAINT business_knowledge_versions_reason_valid CHECK (
        last_reason = btrim(last_reason) AND char_length(last_reason) BETWEEN 1 AND 100
    )
);

