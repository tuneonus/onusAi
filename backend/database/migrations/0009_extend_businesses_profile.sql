ALTER TABLE businesses
    ADD COLUMN description text NULL,
    ADD COLUMN contact_email text NULL,
    ADD COLUMN contact_phone text NULL,
    ADD COLUMN website_url text NULL,
    ADD COLUMN timezone text NULL,
    ADD COLUMN opening_hours jsonb NULL,
    ADD CONSTRAINT businesses_description_valid CHECK (
        description IS NULL OR (
            description = btrim(description)
            AND char_length(description) BETWEEN 1 AND 2000
            AND description ~ '[^[:space:]]'
        )
    ),
    ADD CONSTRAINT businesses_contact_email_valid CHECK (
        contact_email IS NULL OR (
            contact_email = lower(btrim(contact_email))
            AND char_length(contact_email) BETWEEN 3 AND 254
            AND contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
        )
    ),
    ADD CONSTRAINT businesses_contact_phone_valid CHECK (
        contact_phone IS NULL OR (
            contact_phone = btrim(contact_phone)
            AND char_length(contact_phone) BETWEEN 3 AND 40
            AND contact_phone ~ '[^[:space:]]'
        )
    ),
    ADD CONSTRAINT businesses_website_url_valid CHECK (
        website_url IS NULL OR (
            website_url = btrim(website_url)
            AND char_length(website_url) BETWEEN 1 AND 500
            AND website_url ~ '^https?://[^[:space:]]+$'
        )
    ),
    ADD CONSTRAINT businesses_timezone_valid CHECK (
        timezone IS NULL OR (
            timezone = btrim(timezone)
            AND char_length(timezone) BETWEEN 1 AND 100
            AND timezone ~ '[^[:space:]]'
        )
    ),
    ADD CONSTRAINT businesses_opening_hours_valid CHECK (
        opening_hours IS NULL OR jsonb_typeof(opening_hours) = 'object'
    );
