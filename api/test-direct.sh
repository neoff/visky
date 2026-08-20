#!/usr/bin/env bash
# Integration smoke test for POST /api/auth/direct against a running local api.
# Uses DUMMY creds — proves the route reaches VK and returns a structured error
# (not a crash / not 'vkBlankUrl is not defined').
BASE="${1:-http://localhost:3000}"
echo "=== POST $BASE/api/auth/direct (dummy creds, Kate Mobile default) ==="
curl -sS -X POST "$BASE/api/auth/direct" \
  -H 'content-type: application/json' \
  -d '{"login":"probe_x9f2@example.com","password":"xProbe123456!"}' \
  -w '\n[http:%{http_code}]\n' --max-time 25
echo
echo "=== missing creds -> expect 400 ==="
curl -sS -X POST "$BASE/api/auth/direct" \
  -H 'content-type: application/json' \
  -d '{}' \
  -w '\n[http:%{http_code}]\n' --max-time 10
