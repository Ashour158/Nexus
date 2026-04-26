#!/bin/bash
set -e
mkdir -p infrastructure/nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infrastructure/nginx/certs/nexus.key \
  -out infrastructure/nginx/certs/nexus.crt \
  -subj "/C=US/ST=Dev/L=Dev/O=NEXUS/CN=localhost"
echo "✓ Self-signed certificate generated at infrastructure/nginx/certs/"
echo "  Replace with Let's Encrypt for production."
