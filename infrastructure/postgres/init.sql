-- NEXUS — Postgres bootstrap
-- Runs once on first container start (/docker-entrypoint-initdb.d).
-- The default POSTGRES_USER (nexus) and POSTGRES_DB (nexus) are created by the
-- postgres image; here we provision the per-service databases plus extensions.

CREATE DATABASE nexus_auth;
CREATE DATABASE nexus_crm;
CREATE DATABASE nexus_finance;
CREATE DATABASE nexus_notifications;
CREATE DATABASE nexus_comm;
CREATE DATABASE nexus_storage;
CREATE DATABASE nexus_workflow;
CREATE DATABASE nexus_billing;
CREATE DATABASE nexus_integration;
CREATE DATABASE nexus_blueprint;
CREATE DATABASE nexus_approval;
CREATE DATABASE nexus_cadence;
CREATE DATABASE nexus_territory;
CREATE DATABASE nexus_planning;
CREATE DATABASE nexus_reporting;
CREATE DATABASE nexus_portal;
CREATE DATABASE nexus_knowledge;
CREATE DATABASE nexus_incentive;
CREATE DATABASE nexus_data;
CREATE DATABASE nexus_chatbot;

GRANT ALL PRIVILEGES ON DATABASE nexus_auth TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_crm TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_finance TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_notifications TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_comm TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_storage TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_workflow TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_billing TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_integration TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_blueprint TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_approval TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_cadence TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_territory TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_planning TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_reporting TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_portal TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_knowledge TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_incentive TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_data TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_chatbot TO nexus;
GRANT ALL PRIVILEGES ON DATABASE nexus_document TO nexus;

-- Enable required extensions in each database
\c nexus_auth;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\c nexus_crm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

\c nexus_finance;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_notifications;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_comm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_storage;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_workflow;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_billing;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_integration;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_blueprint;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_approval;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_cadence;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_territory;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_planning;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_reporting;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_portal;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_knowledge;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

\c nexus_incentive;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_data;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_chatbot;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\c nexus_document;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";