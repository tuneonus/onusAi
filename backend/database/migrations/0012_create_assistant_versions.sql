CREATE TABLE assistant_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assistant_id uuid NOT NULL,
    business_id uuid NOT NULL,
    version_number integer NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    display_name text NOT NULL,
    description text NULL,
    welcome_message text NOT NULL,
    system_instructions text NOT NULL,
    language text NOT NULL DEFAULT 'en',
    tone text NOT NULL DEFAULT 'professional',
    fallback_message text NOT NULL,
    model_settings jsonb NOT NULL,
    allowed_tools text[] NOT NULL DEFAULT '{}'::text[],
    allowed_knowledge_scopes text[] NOT NULL DEFAULT ARRAY['public']::text[],
    knowledge_location_scope text NOT NULL DEFAULT 'business_wide',
    created_by_user_id uuid NULL REFERENCES users (id) ON DELETE SET NULL,
    published_by_user_id uuid NULL REFERENCES users (id) ON DELETE SET NULL,
    published_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT assistant_versions_assistant_fk
        FOREIGN KEY (business_id, assistant_id)
        REFERENCES assistants (business_id, id)
        ON DELETE CASCADE,
    CONSTRAINT assistant_versions_business_id_unique UNIQUE (business_id, id),
    CONSTRAINT assistant_versions_number_unique UNIQUE (assistant_id, version_number),
    CONSTRAINT assistant_versions_number_valid CHECK (version_number >= 1),
    CONSTRAINT assistant_versions_status_valid CHECK (status IN ('draft', 'published', 'superseded')),
    CONSTRAINT assistant_versions_display_name_valid CHECK (
        display_name = btrim(display_name)
        AND char_length(display_name) BETWEEN 1 AND 120
        AND display_name ~ '[^[:space:]]'
    ),
    CONSTRAINT assistant_versions_description_valid CHECK (
        description IS NULL OR (
            description = btrim(description)
            AND char_length(description) BETWEEN 1 AND 1000
            AND description ~ '[^[:space:]]'
        )
    ),
    CONSTRAINT assistant_versions_welcome_message_valid CHECK (
        welcome_message = btrim(welcome_message)
        AND char_length(welcome_message) BETWEEN 1 AND 1000
        AND welcome_message ~ '[^[:space:]]'
    ),
    CONSTRAINT assistant_versions_system_instructions_valid CHECK (
        system_instructions = btrim(system_instructions)
        AND char_length(system_instructions) BETWEEN 1 AND 8000
        AND system_instructions ~ '[^[:space:]]'
    ),
    CONSTRAINT assistant_versions_language_valid CHECK (
        language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
    ),
    CONSTRAINT assistant_versions_tone_valid CHECK (
        tone IN ('professional', 'friendly', 'concise', 'empathetic', 'formal')
    ),
    CONSTRAINT assistant_versions_fallback_message_valid CHECK (
        fallback_message = btrim(fallback_message)
        AND char_length(fallback_message) BETWEEN 1 AND 1000
        AND fallback_message ~ '[^[:space:]]'
    ),
    CONSTRAINT assistant_versions_model_settings_valid CHECK (
        jsonb_typeof(model_settings) = 'object'
    ),
    CONSTRAINT assistant_versions_allowed_tools_valid CHECK (
        allowed_tools <@ ARRAY[
            'lookup_availability',
            'request_lead_capture',
            'request_appointment_booking',
            'request_human_handoff'
        ]::text[]
    ),
    CONSTRAINT assistant_versions_knowledge_scopes_valid CHECK (
        allowed_knowledge_scopes <@ ARRAY['public', 'staff_only']::text[]
    ),
    CONSTRAINT assistant_versions_knowledge_location_scope_valid CHECK (
        knowledge_location_scope IN ('business_wide', 'assigned_location', 'selected_locations')
    ),
    CONSTRAINT assistant_versions_published_state_valid CHECK (
        (status = 'draft' AND published_at IS NULL)
        OR (status IN ('published', 'superseded') AND published_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX assistant_versions_one_draft_idx
    ON assistant_versions (assistant_id)
    WHERE status = 'draft';

CREATE UNIQUE INDEX assistant_versions_one_published_idx
    ON assistant_versions (assistant_id)
    WHERE status = 'published';

CREATE INDEX assistant_versions_business_assistant_idx
    ON assistant_versions (business_id, assistant_id, version_number DESC);

CREATE TABLE assistant_version_knowledge_locations (
    business_id uuid NOT NULL,
    assistant_version_id uuid NOT NULL,
    location_id uuid NOT NULL,
    PRIMARY KEY (assistant_version_id, location_id),
    FOREIGN KEY (business_id, assistant_version_id)
        REFERENCES assistant_versions (business_id, id)
        ON DELETE CASCADE,
    FOREIGN KEY (business_id, location_id)
        REFERENCES business_locations (business_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX assistant_version_knowledge_locations_loc_idx
    ON assistant_version_knowledge_locations (business_id, location_id);

CREATE TRIGGER assistant_versions_set_updated_at
    BEFORE UPDATE ON assistant_versions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION enforce_assistant_version_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status IN ('published', 'superseded') THEN
        IF NOT (
            OLD.status = 'published'
            AND NEW.status = 'superseded'
            AND NEW.assistant_id = OLD.assistant_id
            AND NEW.business_id = OLD.business_id
            AND NEW.version_number = OLD.version_number
            AND NEW.display_name = OLD.display_name
            AND NEW.description IS NOT DISTINCT FROM OLD.description
            AND NEW.welcome_message = OLD.welcome_message
            AND NEW.system_instructions = OLD.system_instructions
            AND NEW.language = OLD.language
            AND NEW.tone = OLD.tone
            AND NEW.fallback_message = OLD.fallback_message
            AND NEW.model_settings = OLD.model_settings
            AND NEW.allowed_tools = OLD.allowed_tools
            AND NEW.allowed_knowledge_scopes = OLD.allowed_knowledge_scopes
            AND NEW.knowledge_location_scope = OLD.knowledge_location_scope
            AND NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id
            AND NEW.published_by_user_id IS NOT DISTINCT FROM OLD.published_by_user_id
            AND NEW.published_at = OLD.published_at
            AND NEW.created_at = OLD.created_at
        ) THEN
            RAISE EXCEPTION 'Published and superseded assistant versions are immutable.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER assistant_versions_immutability
    BEFORE UPDATE ON assistant_versions
    FOR EACH ROW EXECUTE FUNCTION enforce_assistant_version_immutability();

CREATE FUNCTION enforce_assistant_knowledge_locations_draft() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM assistant_versions
        WHERE id = NEW.assistant_version_id AND status <> 'draft'
    ) THEN
        RAISE EXCEPTION 'Knowledge locations cannot be modified on non-draft assistant versions.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER assistant_version_knowledge_locations_draft_only
    BEFORE INSERT OR UPDATE ON assistant_version_knowledge_locations
    FOR EACH ROW EXECUTE FUNCTION enforce_assistant_knowledge_locations_draft();
