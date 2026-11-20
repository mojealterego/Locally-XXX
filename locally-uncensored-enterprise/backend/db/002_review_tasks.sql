BEGIN;
CREATE TABLE omega.review_tasks (
    tenant_id uuid NOT NULL REFERENCES omega.tenants(id),
    id uuid NOT NULL,
    agent_id uuid NOT NULL,
    subject text NOT NULL CHECK (subject ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
    revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    name text NOT NULL CHECK (octet_length(name) BETWEEN 1 AND 256),
    role text NOT NULL CHECK (octet_length(role) BETWEEN 1 AND 2048),
    tools jsonb NOT NULL CHECK (jsonb_typeof(tools)='array' AND jsonb_array_length(tools)<=64),
    digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','REVIEWED','APPROVED','REJECTED','EXPIRED')),
    reviewer text CHECK (reviewer IS NULL OR (reviewer ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' AND reviewer<>subject)),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,id),
    CHECK ((status IN ('APPROVED','REJECTED')) = (reviewer IS NOT NULL))
);
CREATE FUNCTION omega.review_transition() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF NOT ((OLD.status='PENDING' AND NEW.status IN ('REVIEWED','EXPIRED')) OR (OLD.status='REVIEWED' AND NEW.status IN ('APPROVED','REJECTED','EXPIRED'))) THEN
        RAISE EXCEPTION 'Invalid review transition';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER review_transition BEFORE UPDATE ON omega.review_tasks FOR EACH ROW EXECUTE FUNCTION omega.review_transition();
ALTER TABLE omega.review_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE omega.review_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_review ON omega.review_tasks TO omega_runtime
    USING (tenant_id = nullif(current_setting('omega.tenant_id',true),'')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('omega.tenant_id',true),'')::uuid);
GRANT SELECT ON omega.review_tasks TO omega_runtime;
GRANT INSERT (tenant_id,id,agent_id,subject,revision,name,role,tools,digest) ON omega.review_tasks TO omega_runtime;
GRANT UPDATE (status,reviewer,updated_at) ON omega.review_tasks TO omega_runtime;
COMMIT;
