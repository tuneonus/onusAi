CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER businesses_set_updated_at
    BEFORE UPDATE ON businesses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER business_members_set_updated_at
    BEFORE UPDATE ON business_members
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER business_locations_set_updated_at
    BEFORE UPDATE ON business_locations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
