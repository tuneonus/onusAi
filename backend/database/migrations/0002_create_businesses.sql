CREATE TABLE businesses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT businesses_name_valid CHECK (
        name = btrim(name)
        AND char_length(name) BETWEEN 1 AND 160
        AND name ~ '[^[:space:]]'
    )
);
