ALTER TABLE document_versions
    ADD CONSTRAINT document_versions_document_id_unique UNIQUE (document_id, id);

CREATE TABLE document_ingestion_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL,
    document_id uuid NOT NULL,
    document_version_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    attempt_count integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_token uuid NULL,
    leased_by text NULL,
    leased_at timestamptz NULL,
    lease_expires_at timestamptz NULL,
    last_error text NULL,
    completed_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT document_ingestion_jobs_document_fk
        FOREIGN KEY (business_id, document_id)
        REFERENCES documents (business_id, id)
        ON DELETE CASCADE,
    CONSTRAINT document_ingestion_jobs_version_fk
        FOREIGN KEY (business_id, document_version_id)
        REFERENCES document_versions (business_id, id)
        ON DELETE CASCADE,
    CONSTRAINT document_ingestion_jobs_doc_version_pair_fk
        FOREIGN KEY (document_id, document_version_id)
        REFERENCES document_versions (document_id, id)
        ON DELETE CASCADE,
    CONSTRAINT document_ingestion_jobs_status_valid CHECK (
        status IN ('queued', 'leased', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT document_ingestion_jobs_attempt_count_valid CHECK (attempt_count >= 0),
    CONSTRAINT document_ingestion_jobs_max_attempts_valid CHECK (max_attempts BETWEEN 1 AND 10),
    CONSTRAINT document_ingestion_jobs_attempt_bounds CHECK (attempt_count <= max_attempts),
    CONSTRAINT document_ingestion_jobs_leased_by_valid CHECK (
        leased_by IS NULL OR (
            leased_by = btrim(leased_by)
            AND char_length(leased_by) BETWEEN 1 AND 120
            AND leased_by ~ '[^[:space:]]'
        )
    ),
    CONSTRAINT document_ingestion_jobs_last_error_valid CHECK (
        last_error IS NULL OR (
            last_error = btrim(last_error)
            AND char_length(last_error) BETWEEN 1 AND 500
            AND last_error ~ '[^[:space:]]'
        )
    ),
    CONSTRAINT document_ingestion_jobs_lease_state_valid CHECK (
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
    CONSTRAINT document_ingestion_jobs_completed_state_valid CHECK (
        (status = 'completed' AND completed_at IS NOT NULL)
        OR (status <> 'completed' AND completed_at IS NULL)
    )
);

CREATE UNIQUE INDEX document_ingestion_jobs_one_active_per_version_idx
    ON document_ingestion_jobs (document_version_id)
    WHERE status IN ('queued', 'leased');

CREATE INDEX document_ingestion_jobs_lease_poll_idx
    ON document_ingestion_jobs (next_attempt_at ASC, created_at ASC)
    WHERE status = 'queued';

CREATE INDEX document_ingestion_jobs_expired_lease_idx
    ON document_ingestion_jobs (lease_expires_at ASC)
    WHERE status = 'leased';

CREATE INDEX document_ingestion_jobs_business_doc_idx
    ON document_ingestion_jobs (business_id, document_id, created_at DESC);

CREATE TRIGGER document_ingestion_jobs_set_updated_at
    BEFORE UPDATE ON document_ingestion_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

