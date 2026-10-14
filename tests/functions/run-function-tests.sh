#!/usr/bin/env bash
# HobbyNest — Edge Function tests (needs Deno 2: https://deno.com). Uses mocks only.
#   ./tests/functions/run-function-tests.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FN="$(cd "$HERE/../../supabase/functions" && pwd)"
cd "$FN"
deno check delete-account/index.ts notify/index.ts

echo "== delete-account =="
deno run -A --quiet "$HERE/harness.ts" "file://$FN/delete-account/index.ts" '[
  {"name":"no login (must NOT delete)","token":"sb_publishable_x","body":{"confirm":"DELETE"}},
  {"name":"logged in but not confirmed (must NOT delete)","body":{"confirm":"selftest"}},
  {"name":"confirmed delete (deletes + emails user and enrolled learners)","body":{"confirm":"DELETE"}}
]'

echo; echo "== notify =="
deno run -A --quiet "$HERE/harness.ts" "file://$FN/notify/index.ts" '[
  {"name":"ping","body":{"type":"ping"}},
  {"name":"welcome email","body":{"type":"welcome"}},
  {"name":"welcome again (must not resend)","body":{"type":"welcome"}},
  {"name":"message burst of 2 (one email)","body":{"type":"message","message_ids":[10,11]}},
  {"name":"session email (skips learner who opted out)","body":{"type":"session","session_id":5}},
  {"name":"admin-deleted webhook","token":"svc","body":{"type":"DELETE","table":"profiles","old_record":{"id":"0a6f2f9e-9999-4999-8999-999999999999","email":"gone@test.dev","full_name":"Gone"}}},
  {"name":"forged webhook from a normal user (must be ignored)","body":{"type":"DELETE","table":"profiles","old_record":{"id":"x","email":"victim@test.dev"}}}
]'
