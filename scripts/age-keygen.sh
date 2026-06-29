#!/usr/bin/env bash
set -euo pipefail

# Nexus CRM — Age Key Generation

echo "=== Age Key Generation ==="

# Generate age key
age-keygen -o keys/age.key

echo "✅ Age key generated: keys/age.key"
