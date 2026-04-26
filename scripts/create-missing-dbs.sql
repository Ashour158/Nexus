-- scripts/create-missing-dbs.sql
-- Run this against your Postgres container if the volume already existed before init.sql was
-- updated. Safe to run multiple times (all statements are idempotent).
--
-- Usage:
--   docker compose exec postgres psql -U nexus -f /scripts/create-missing-dbs.sql
-- Or from the host:
--   cat scripts/create-missing-dbs.sql | docker compose exec -T postgres psql -U nexus

CREATE DATABASE IF NOT EXISTS nexus_approval;
CREATE DATABASE IF NOT EXISTS nexus_cadence;
CREATE DATABASE IF NOT EXISTS nexus_territory;
CREATE DATABASE IF NOT EXISTS nexus_planning;
CREATE DATABASE IF NOT EXISTS nexus_reporting;
CREATE DATABASE IF NOT EXISTS nexus_portal;
CREATE DATABASE IF NOT EXISTS nexus_knowledge;
CREATE DATABASE IF NOT EXISTS nexus_incentive;
CREATE DATABASE IF NOT EXISTS nexus_data;
CREATE DATABASE IF NOT EXISTS nexus_chatbot;

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

\connect nexus_approval
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_cadence
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_territory
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_planning
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_reporting
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_portal
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_knowledge
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_incentive
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_data
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\connect nexus_chatbot
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
