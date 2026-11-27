CREATE TABLE conversation_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    sequence_number integer NOT NULL,
    role text NOT NULL,
    author_user_id uuid NULL REFERENCES users (id) ON DELETE SET NULL,
    content text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key text NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT conversation_messages_conversation_fk
        FOREIGN KEY (business_id, conversation_id)
        REFERENCES conversations (business_id, id)
        ON DELETE CASCADE,
    CONSTRAINT conversation_messages_sequence_unique UNIQUE (conversation_id, sequence_number),
    CONSTRAINT conversation_messages_sequence_valid CHECK (sequence_number >= 1),
    CONSTRAINT conversation_messages_role_valid CHECK (
        role IN ('user', 'assistant', 'operator', 'system')
    ),
    CONSTRAINT conversation_messages_content_valid CHECK (
        content = btrim(content)
        AND char_length(content) BETWEEN 1 AND 10000
        AND content ~ '[^[:space:]]'
    ),
    CONSTRAINT conversation_messages_metadata_valid CHECK (
        jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT conversation_messages_idempotency_key_valid CHECK (
        idempotency_key IS NULL OR (
            idempotency_key = btrim(idempotency_key)
            AND char_length(idempotency_key) BETWEEN 1 AND 128
            AND idempotency_key ~ '[^[:space:]]'
        )
    )
);

CREATE INDEX conversation_messages_conv_seq_idx
    ON conversation_messages (business_id, conversation_id, sequence_number ASC);

CREATE UNIQUE INDEX conversation_messages_idempotency_unique
    ON conversation_messages (business_id, conversation_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
