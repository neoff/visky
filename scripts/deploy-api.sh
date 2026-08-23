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
kubectl --context "$KCTX" -n "$NS" rollout status "deployment/$DEPLOY" --timeout=120s
echo "==> deployed $IMAGE:$TAG"
