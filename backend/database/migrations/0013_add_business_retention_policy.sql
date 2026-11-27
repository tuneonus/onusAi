ALTER TABLE businesses
    ADD COLUMN retention_days integer NULL,
    ADD CONSTRAINT businesses_retention_days_valid CHECK (
        retention_days IS NULL OR retention_days BETWEEN 1 AND 3650
    );
