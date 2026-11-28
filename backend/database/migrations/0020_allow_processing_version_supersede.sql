CREATE OR REPLACE FUNCTION enforce_document_version_transitions() RETURNS trigger
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
            OR (OLD.status = 'processing' AND NEW.status IN ('ready', 'failed', 'superseded', 'deleted'))
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

