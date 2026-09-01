#!/usr/bin/env bash
# Deploy an api image tag to Kubernetes: set the deployment image and wait for
# the rollout. Deploy-only — build+push with build-api.sh first (or use its
# --deploy flag to do both).
#
# Usage:
#   scripts/deploy-api.sh            # deploy the current api/package.json version
#   scripts/deploy-api.sh 1.5.23     # deploy a specific tag
#   scripts/deploy-api.sh latest     # deploy :latest
#
# Env (defaults match this project):
#   KCTX=oracle  NS=frisky  DEPLOY=visky-api  CONTAINER=visky-api  IMAGE=varg/visky-api
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${IMAGE:-varg/visky-api}"
KCTX="${KCTX:-oracle}"
NS="${NS:-frisky}"
DEPLOY="${DEPLOY:-visky-api}"
CONTAINER="${CONTAINER:-visky-api}"

TAG="${1:-}"
if [ -z "$TAG" ]; then
  TAG="$(node -pe 'require("'"$ROOT"'/api/package.json").version')"
fi

echo "==> deploy $IMAGE:$TAG  (ctx=$KCTX ns=$NS deploy=$DEPLOY)"
kubectl --context "$KCTX" -n "$NS" set image "deployment/$DEPLOY" "$CONTAINER=$IMAGE:$TAG"
# 120s was not enough: the vault-agent init container alone took 3m34s on
# 2026-09-01, so the script reported a failure while Kubernetes was still
# rolling out normally. Override with ROLLOUT_TIMEOUT if a deploy is slower.
kubectl --context "$KCTX" -n "$NS" rollout status "deployment/$DEPLOY" --timeout="${ROLLOUT_TIMEOUT:-600s}"
echo "==> deployed $IMAGE:$TAG"
