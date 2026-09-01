#!/usr/bin/env bash
# Roll a web-player image out to Kubernetes.
#
#   scripts/deploy-web.sh           # deploy the current app.json version
#   scripts/deploy-web.sh 1.0.4     # a specific tag
#
# FIRST TIME ONLY — the release has to exist before an image can be set on it:
#
#   helm upgrade --install visky-web web/.github/helm \
#     -n frisky --kube-context oracle \
#     --set image.tag=<version>
#
# The release name IS the object name for the deployment, service and ingress,
# so keep it `visky-web`: `visky-api` is a different release and the two must
# never share a name.
#
# Env: KCTX=oracle NS=frisky DEPLOY=visky-web CONTAINER=visky-web IMAGE=varg/visky-web
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${IMAGE:-varg/visky-web}"
KCTX="${KCTX:-oracle}"
NS="${NS:-frisky}"
DEPLOY="${DEPLOY:-visky-web}"
CONTAINER="${CONTAINER:-visky-web}"

TAG="${1:-}"
if [ -z "$TAG" ]; then
  TAG="$(node -p "require('$ROOT/app/app.json').expo.version")"
fi

echo "==> deploy $IMAGE:$TAG  (ctx=$KCTX ns=$NS deploy=$DEPLOY)"
kubectl --context "$KCTX" -n "$NS" set image "deployment/$DEPLOY" "$CONTAINER=$IMAGE:$TAG"
kubectl --context "$KCTX" -n "$NS" rollout status "deployment/$DEPLOY" --timeout=180s
echo "==> deployed. https://frisky.envarg.com/player/"
