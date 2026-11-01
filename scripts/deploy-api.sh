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
# THE IMAGE ALONE IS NOT ALWAYS A CHANGE.
#
# `set image` to the tag the deployment already carries is a no-op, and
# Kubernetes rolls nothing: the pod keeps running the bytes it started with.
# That is the normal case for a rebuild of the SAME version — a tag is mutable,
# the digest behind it is not the one the pod pulled — and it looked exactly
# like a successful deploy, right down to "successfully rolled out", while the
# cluster served the old build (a route added that way answered 404 for twenty
# minutes). A restart is asked for whenever the image did not change; the
# container pulls Always, so it comes back on the new digest.
before="$(kubectl --context "$KCTX" -n "$NS" get "deployment/$DEPLOY" \
  -o jsonpath="{.spec.template.spec.containers[?(@.name=='$CONTAINER')].image}")"

kubectl --context "$KCTX" -n "$NS" set image "deployment/$DEPLOY" "$CONTAINER=$IMAGE:$TAG"

if [ "$before" = "$IMAGE:$TAG" ]; then
  echo "    the deployment already names $IMAGE:$TAG — restarting it to pull the tag again"
  kubectl --context "$KCTX" -n "$NS" rollout restart "deployment/$DEPLOY"
fi
# 120s was not enough: the vault-agent init container alone took 3m34s on
# 2026-09-01, so the script reported a failure while Kubernetes was still
# rolling out normally. Override with ROLLOUT_TIMEOUT if a deploy is slower.
kubectl --context "$KCTX" -n "$NS" rollout status "deployment/$DEPLOY" --timeout="${ROLLOUT_TIMEOUT:-600s}"
echo "==> deployed $IMAGE:$TAG"
