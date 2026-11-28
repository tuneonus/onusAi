ALTER TABLE document_versions
    ADD COLUMN embedding_model text NULL,
    ADD COLUMN embedding_model_version text NULL,
    ADD COLUMN embedding_dimensions integer NULL,
    ADD COLUMN qdrant_collection text NULL,
    ADD CONSTRAINT document_versions_embedding_model_valid CHECK (
        embedding_model IS NULL OR (
            embedding_model = btrim(embedding_model)
            AND char_length(embedding_model) BETWEEN 1 AND 100
            AND embedding_model ~ '^[A-Za-z0-9._-]+$'
        )
    ),
    ADD CONSTRAINT document_versions_embedding_model_version_valid CHECK (
        embedding_model_version IS NULL OR (
            embedding_model_version = btrim(embedding_model_version)
            AND char_length(embedding_model_version) BETWEEN 1 AND 64
            AND embedding_model_version ~ '^[A-Za-z0-9._-]+$'
        )
    ),
    ADD CONSTRAINT document_versions_embedding_dimensions_valid CHECK (
        embedding_dimensions IS NULL OR (
            embedding_dimensions >= 128 AND embedding_dimensions <= 3072
        )
    ),
    ADD CONSTRAINT document_versions_qdrant_collection_valid CHECK (
        qdrant_collection IS NULL OR (
            qdrant_collection = btrim(qdrant_collection)
            AND char_length(qdrant_collection) BETWEEN 1 AND 160
            AND qdrant_collection ~ '^[A-Za-z0-9_-]+$'
        )
    );

-- Re-queue any existing chunked documents awaiting vector indexing (Step 05.03 -> Step 06.01).
UPDATE document_ingestion_jobs j
SET status = 'queued',
    attempt_count = 0,
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
  AND dv.indexed_at IS NULL
  AND d.deleted_at IS NULL;

