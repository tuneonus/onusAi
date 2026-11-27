CREATE TABLE business_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    role text NOT NULL DEFAULT 'operator',
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT business_members_role_valid CHECK (role IN ('owner', 'operator')),
    CONSTRAINT business_members_business_user_unique UNIQUE (business_id, user_id),
    -- Future tenant-owned tables can reference membership and business together.
    CONSTRAINT business_members_business_id_unique UNIQUE (business_id, id)
);

-- The business-leading unique indexes cover business lookups; this covers a user's businesses.
CREATE INDEX business_members_user_id_idx ON business_members (user_id);
