ALTER TABLE business_locations
    ADD COLUMN address_line1 text NULL,
    ADD COLUMN address_line2 text NULL,
    ADD COLUMN city text NULL,
    ADD COLUMN state_region text NULL,
    ADD COLUMN postal_code text NULL,
    ADD COLUMN country_code text NULL,
    ADD COLUMN contact_email text NULL,
    ADD COLUMN contact_phone text NULL,
    ADD COLUMN timezone text NULL,
    ADD COLUMN opening_hours jsonb NULL,
    ADD COLUMN archived_at timestamptz NULL,
    ADD CONSTRAINT business_locations_address_line1_valid CHECK (
        address_line1 IS NULL OR (
            address_line1 = btrim(address_line1)
            AND char_length(address_line1) BETWEEN 1 AND 200
            AND address_line1 ~ '[^[:space:]]'
        )
    ),
    ADD CONSTRAINT business_locations_address_line2_valid CHECK (
        address_line2 IS NULL OR (
            address_line2 = btrim(address_line2)
            AND char_length(address_line2) BETWEEN 1 AND 200
            AND address_line2 ~ '[^[:space:]]'
        )
    ),
    ADD CONSTRAINT business_locations_city_valid CHECK (
        city IS NULL OR (
            city = btrim(city)
            AND char_length(city) BETWEEN 1 AND 100
            AND city ~ '[^[:space:]]'
        )
    ),
    ADD CONSTRAINT business_locations_state_region_valid CHECK (
        state_region IS NULL OR (
            state_region = btrim(state_region)
            AND char_length(state_region) BETWEEN 1 AND 100
            AND state_region ~ '[^[:space:]]'
        )
    ),
    ADD CONSTRAINT business_locations_postal_code_valid CHECK (
        postal_code IS NULL OR (
            postal_code = btrim(postal_code)
            AND char_length(postal_code) BETWEEN 1 AND 32
            AND postal_code ~ '[^[:space:]]'
        )
    ),
    ADD CONSTRAINT business_locations_country_code_valid CHECK (
        country_code IS NULL OR country_code ~ '^[A-Z]{2}$'
    ),
    ADD CONSTRAINT business_locations_address_consistency CHECK (
        (
            address_line1 IS NULL
            AND address_line2 IS NULL
            AND city IS NULL
            AND state_region IS NULL
            AND postal_code IS NULL
            AND country_code IS NULL
        ) OR (
            address_line1 IS NOT NULL
            AND city IS NOT NULL
            AND country_code IS NOT NULL
        )
    ),
    ADD CONSTRAINT business_locations_contact_email_valid CHECK (
        contact_email IS NULL OR (
            contact_email = lower(btrim(contact_email))
            AND char_length(contact_email) BETWEEN 3 AND 254
            AND contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
        )
    ),
    ADD CONSTRAINT business_locations_contact_phone_valid CHECK (
        contact_phone IS NULL OR (
            contact_phone = btrim(contact_phone)
            AND char_length(contact_phone) BETWEEN 3 AND 40
            AND contact_phone ~ '[^[:space:]]'
        )
    ),
    ADD CONSTRAINT business_locations_timezone_valid CHECK (
        timezone IS NULL OR (
            timezone = btrim(timezone)
            AND char_length(timezone) BETWEEN 1 AND 100
            AND timezone ~ '[^[:space:]]'
        )
    ),
    ADD CONSTRAINT business_locations_opening_hours_valid CHECK (
        opening_hours IS NULL OR jsonb_typeof(opening_hours) = 'object'
    );

-- Allow reusing a location name once prior locations with that name are archived.
DROP INDEX business_locations_business_name_unique;

CREATE UNIQUE INDEX business_locations_business_name_unique
    ON business_locations (business_id, lower(name))
    WHERE archived_at IS NULL;

CREATE INDEX business_locations_business_active_idx
    ON business_locations (business_id, created_at, id)
    WHERE archived_at IS NULL;
