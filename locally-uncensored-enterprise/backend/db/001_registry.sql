BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA omega;
REVOKE ALL ON SCHEMA omega FROM PUBLIC;
CREATE ROLE omega_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA omega TO omega_runtime;
CREATE TABLE omega.tenants (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 256)
);
CREATE TABLE omega.agents (
    tenant_id uuid NOT NULL REFERENCES omega.tenants(id),
    id uuid NOT NULL,
    revision bigint NOT NULL CHECK (revision > 0),
    manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
    PRIMARY KEY (tenant_id,id,revision)
);
CREATE TABLE omega.rag_chunks (
    tenant_id uuid NOT NULL REFERENCES omega.tenants(id),
    id uuid NOT NULL,
    document_id uuid NOT NULL,
    embedding_model text NOT NULL CHECK (char_length(embedding_model) BETWEEN 1 AND 256),
    content text NOT NULL CHECK (octet_length(content) <= 180000),
    embedding vector(768) NOT NULL,
    PRIMARY KEY (tenant_id,id)
);
CREATE INDEX rag_document ON omega.rag_chunks(tenant_id,document_id);
CREATE INDEX rag_model ON omega.rag_chunks(tenant_id,embedding_model);
ALTER TABLE omega.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE omega.agents FORCE ROW LEVEL SECURITY;
ALTER TABLE omega.rag_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE omega.rag_chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_agents ON omega.agents TO omega_runtime
    USING (tenant_id = nullif(current_setting('omega.tenant_id',true),'')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('omega.tenant_id',true),'')::uuid);
CREATE POLICY tenant_chunks ON omega.rag_chunks TO omega_runtime
    USING (tenant_id = nullif(current_setting('omega.tenant_id',true),'')::uuid)
    WITH CHECK (tenant_id = nullif(current_setting('omega.tenant_id',true),'')::uuid);
GRANT SELECT, INSERT ON omega.agents TO omega_runtime;
GRANT SELECT, INSERT, DELETE ON omega.rag_chunks TO omega_runtime;
COMMIT;
