#!/usr/bin/env bash
# HobbyNest database tests. Needs a LOCAL, throwaway PostgreSQL (15+) — never your real project.
#
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres ./tests/db/run-db-tests.sh
#
# It creates two temporary databases, loads a tiny "Supabase look-alike"
# (auth.users, auth.uid(), the anon/authenticated roles), runs database.sql,
# then checks messaging, session notices, privacy and account deletion.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PSQL="psql -X -q -v ON_ERROR_STOP=1"

# The shim creates cluster-wide roles; ignore "already exists" on a second run.
fresh_db () {
  $PSQL -d postgres -c "drop database if exists $1" -c "create database $1" >/dev/null
  $PSQL -d "$1" -v ON_ERROR_STOP=0 -f "$HERE/supabase_shim.sql" >/dev/null 2>&1 || true
}

echo "== 1. database.sql on a new project =="
fresh_db hn_test
$PSQL -d hn_test -f "$ROOT/database.sql" >/dev/null 2>&1
$PSQL -d hn_test -f "$ROOT/database.sql" >/dev/null 2>&1   # must be safe to re-run
echo "PASS  database.sql loads, and re-runs without errors"
$PSQL -d hn_test -f "$HERE/test_database.sql"

echo
echo "== 2. database.sql on an old project with hand-made tables =="
fresh_db hn_test_legacy
$PSQL -d hn_test_legacy -f "$HERE/legacy_tables.sql" >/dev/null
$PSQL -d hn_test_legacy -f "$ROOT/database.sql" >/dev/null 2>&1
$PSQL -d hn_test_legacy -f "$HERE/test_legacy_delete.sql"

$PSQL -d postgres -c "drop database hn_test" -c "drop database hn_test_legacy" >/dev/null
echo
echo "All database tests passed."
