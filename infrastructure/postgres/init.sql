-- NEXUS — Postgres bootstrap
-- Runs once on first container start (/docker-entrypoint-initdb.d).
-- The default POSTGRES_USER (nexus) and POSTGRES_DB (nexus) are created by the
-- postgres image; here we provision the per-service databases plus extensions.

CREATE DATABASE nexus_auth;
CREATE DATABASE nexus_crm;
CREATE DATABASE nexus_finance;
CREATE DATABASE nexus_notifications;

GRANT ALL PRIVILEGES ON DATABASE nexus_auth TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_crm TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_finance TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_notifications TO nexus;

\connect nexus_auth
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

\connect nexus_crm
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

\connect nexus_finance
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_notifications
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
