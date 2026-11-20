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
#   KCTX=oracle  NS=frisky  DEPLOY=visky-api  CONTAINER=visky-api  IMAGE=registry.gitlab.com/en.varg/visky-api
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${IMAGE:-registry.gitlab.com/en.varg/visky-api}"
KCTX="${KCTX:-oracle}"
NS="${NS:-frisky}"
DEPLOY="${DEPLOY:-visky-api}"
CONTAINER="${CONTAINER:-visky-api}"

TAG="${1:-}"
if [ -z "$TAG" ]; then
  TAG="$(node -pe 'require("'"$ROOT"'/api/package.json").version')"
fi

echo "==> deploy $IMAGE:$TAG  (ctx=$KCTX ns=$NS deploy=$DEPLOY)"

# A PRIVATE REGISTRY NEEDS THE PULL HALF, AND ITS ABSENCE IS SILENT HERE.
#
# The image lives in the private GitLab registry, so the pod pulls it with the
# `gitlab-registry` secret. Without it `set image` below still succeeds and the
# rollout still starts — the new pod just sits in ImagePullBackOff while the old
# one keeps serving, which reads as a deploy hanging for no reason. Checked
# before anything is changed, so a missing secret costs nothing.
#
# api/k8s/deployment.registry.patch.yaml is the record of both, and has the
# command that copies the secret from a namespace that already holds one.
case "$IMAGE" in
  registry.gitlab.com/*)
    if ! kubectl --context "$KCTX" -n "$NS" get secret gitlab-registry >/dev/null 2>&1; then
      echo "!! no secret/gitlab-registry in ns $NS — the pod cannot pull $IMAGE." >&2
      echo "   Create it first; see api/k8s/deployment.registry.patch.yaml." >&2
      exit 1
    fi
    pull="$(kubectl --context "$KCTX" -n "$NS" get "deployment/$DEPLOY" \
      -o jsonpath='{.spec.template.spec.imagePullSecrets[*].name}')"
    case " $pull " in
      *" gitlab-registry "*) ;;
      *)
        echo "    deployment/$DEPLOY does not name gitlab-registry (has: ${pull:-none}) — patching it"
        kubectl --context "$KCTX" -n "$NS" patch "deployment/$DEPLOY" \
          --patch-file "$ROOT/api/k8s/deployment.registry.patch.yaml"
        ;;
    esac
    ;;
esac

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
