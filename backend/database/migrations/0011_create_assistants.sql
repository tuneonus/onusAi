CREATE TABLE assistants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    location_id uuid NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Composite FK guarantees a location-scoped assistant belongs to the same tenant.
    CONSTRAINT assistants_business_location_fk
        FOREIGN KEY (business_id, location_id)
        REFERENCES business_locations (business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT assistants_business_id_unique UNIQUE (business_id, id)
);

-- Allow at most one business-level default assistant and one assistant per location within a tenant.
CREATE UNIQUE INDEX assistants_business_default_unique
    ON assistants (business_id)
    WHERE location_id IS NULL;

CREATE UNIQUE INDEX assistants_business_location_unique
    ON assistants (business_id, location_id)
    WHERE location_id IS NOT NULL;

CREATE TRIGGER assistants_set_updated_at
    BEFORE UPDATE ON assistants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
