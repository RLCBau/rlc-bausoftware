#!/usr/bin/env bash
set -e

echo "Cleaning old audit logs..."

docker exec rlc-postgres psql -U user -d rlc -c \
"DELETE FROM \"AuditLog\" WHERE \"createdAt\" < NOW() - INTERVAL '180 days';"

echo "AuditLog cleanup finished."
