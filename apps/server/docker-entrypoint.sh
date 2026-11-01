#!/bin/sh
set -e
echo "applying migrations..."
node --import tsx src/db/migrate.ts
echo "starting server..."
exec node --import tsx src/index.ts
