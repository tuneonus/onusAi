CREATE TABLE business_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT business_locations_name_valid CHECK (
        name = btrim(name)
        AND char_length(name) BETWEEN 1 AND 160
        AND name ~ '[^[:space:]]'
    ),
    -- Future location references must include business_id to prevent cross-tenant links.
    CONSTRAINT business_locations_business_id_unique UNIQUE (business_id, id)
);

-- A name identifies a location within its business, not globally.
CREATE UNIQUE INDEX business_locations_business_name_unique
    ON business_locations (business_id, lower(name));
