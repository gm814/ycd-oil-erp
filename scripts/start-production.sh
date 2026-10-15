#!/bin/sh
set -eu
if [ "${YCD_BOOTSTRAP:-false}" = "true" ]; then
  node scripts/bootstrap-production.cjs
else
  node node_modules/prisma/build/index.js migrate deploy
fi
exec node server.js
