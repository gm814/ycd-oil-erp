#!/bin/sh
set -eu
if [ "${YCD_BOOTSTRAP:-false}" = "true" ]; then
  node scripts/bootstrap-production.cjs
fi
exec node server.js
