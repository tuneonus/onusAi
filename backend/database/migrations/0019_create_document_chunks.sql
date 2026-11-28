ALTER TABLE document_versions
    ADD COLUMN chunk_version text NULL,
    ADD COLUMN chunk_count integer NOT NULL DEFAULT 0,
    ADD COLUMN normalized_char_count integer NULL,
    ADD COLUMN normalized_sha256 text NULL,
    ADD CONSTRAINT document_versions_chunk_count_valid CHECK (chunk_count >= 0),
    ADD CONSTRAINT document_versions_chunk_version_valid CHECK (
        chunk_version IS NULL OR (
            chunk_version = btrim(chunk_version)
            AND char_length(chunk_version) BETWEEN 1 AND 64
            AND chunk_version ~ '^[A-Za-z0-9._-]+$'
        )
    ),
    ADD CONSTRAINT document_versions_normalized_char_count_valid CHECK (
        normalized_char_count IS NULL OR normalized_char_count >= 1
    ),
    ADD CONSTRAINT document_versions_normalized_sha256_valid CHECK (
        normalized_sha256 IS NULL OR normalized_sha256 ~ '^[0-9a-f]{64}$'
    );

CREATE TABLE document_chunks (
    id uuid PRIMARY KEY,
    business_id uuid NOT NULL,
    document_id uuid NOT NULL,
    document_version_id uuid NOT NULL,
    location_id uuid NULL,
    visibility text NOT NULL,
    chunk_version text NOT NULL,
    chunk_index integer NOT NULL,
    heading_path text[] NOT NULL DEFAULT '{}'::text[],
    char_start integer NOT NULL,
    char_end integer NOT NULL,
    char_count integer NOT NULL,
    content_sha256 text NOT NULL,
    chunk_text text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT document_chunks_document_fk
        FOREIGN KEY (business_id, document_id)
        REFERENCES documents (business_id, id)
        ON DELETE CASCADE,
    CONSTRAINT document_chunks_version_fk
        FOREIGN KEY (business_id, document_version_id)
        REFERENCES document_versions (business_id, id)
        ON DELETE CASCADE,
    CONSTRAINT document_chunks_doc_version_pair_fk
        FOREIGN KEY (document_id, document_version_id)
        REFERENCES document_versions (document_id, id)
        ON DELETE CASCADE,
    CONSTRAINT document_chunks_business_location_fk
        FOREIGN KEY (business_id, location_id)
        REFERENCES business_locations (business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT document_chunks_version_index_unique UNIQUE (document_version_id, chunk_index),
    CONSTRAINT document_chunks_visibility_valid CHECK (visibility IN ('public', 'staff_only')),
    CONSTRAINT document_chunks_chunk_version_valid CHECK (
        chunk_version = btrim(chunk_version)
        AND char_length(chunk_version) BETWEEN 1 AND 64
        AND chunk_version ~ '^[A-Za-z0-9._-]+$'
    ),
    CONSTRAINT document_chunks_index_valid CHECK (chunk_index >= 0),
    CONSTRAINT document_chunks_offsets_valid CHECK (
        char_start >= 0 AND char_end > char_start AND char_count = char_end - char_start
    ),
    CONSTRAINT document_chunks_sha256_valid CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT document_chunks_text_valid CHECK (
        char_length(chunk_text) = char_count
        AND octet_length(chunk_text) <= 65536
        AND chunk_text ~ '[^[:space:]]'
    )
);

CREATE INDEX document_chunks_business_version_idx
    ON document_chunks (business_id, document_version_id, chunk_index ASC);

CREATE INDEX document_chunks_business_visibility_idx
    ON document_chunks (business_id, visibility, document_id);

-- Re-queue any pre-05.03 completed ingestion jobs whose document versions are still
-- in 'processing' without persisted chunks so they are not left stuck.
UPDATE document_ingestion_jobs j
SET status = 'queued',
    completed_at = NULL,
    next_attempt_at = CURRENT_TIMESTAMP,
    last_error = NULL
FROM document_versions dv
JOIN documents d
  ON d.business_id = dv.business_id AND d.id = dv.document_id
WHERE j.business_id = dv.business_id
  AND j.document_version_id = dv.id
  AND j.status = 'completed'
  AND dv.status = 'processing'
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM document_chunks c
    WHERE c.document_version_id = dv.id
  );

