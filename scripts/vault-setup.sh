#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Vault Setup Script

echo "=== Setting up Vault ==="

# Enable Kubernetes auth
vault auth enable kubernetes || true

# Configure Kubernetes auth
vault write auth/kubernetes/config \
  kubernetes_host="https://$KUBERNETES_PORT_443_TCP_ADDR:443" \
  kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
  token_reviewer_jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)"

# Create policy
cat > /tmp/nexus-crm-policy.hcl <<EOF
path "database/creds/nexus-crm" {
  capabilities = ["read"]
}
path "secret/data/nexus-crm/*" {
  capabilities = ["read"]
}
EOF

vault policy write nexus-crm /tmp/nexus-crm-policy.hcl

# Create role
vault write auth/kubernetes/role/nexus-crm \
  bound_service_account_names=nexus-crm \
  bound_service_account_namespaces=nexus \
  policies=nexus-crm \
  ttl=1h

# Enable database secrets engine
vault secrets enable database || true

# Configure PostgreSQL connection
vault write database/config/nexus-crm \
  plugin_name=postgresql-database-plugin \
  allowed_roles=nexus-crm \
  connection_url="postgresql://{{username}}:{{password}}@postgres:5432/nexus" \
  username="vault" \
  password="vault"

# Create role for dynamic credentials
vault write database/roles/nexus-crm \
  db_name=nexus-crm \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl=1h \
  max_ttl=24h

echo "✅ Vault setup complete"
