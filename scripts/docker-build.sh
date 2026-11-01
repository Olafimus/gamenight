#!/bin/sh
# Usage: scripts/docker-build.sh [--repo olafimus/olivers-master-repo] [--tag 1.0.0] [--push] [--multiarch]
# Images: <repo>:gamenight-server-<tag>, <repo>:gamenight-web-<tag> (+ -latest when tag != latest)
set -e
cd "$(dirname "$0")/.."
IMAGE_REPO="${IMAGE_REPO:-olafimus/olivers-master-repo}"; TAG="${TAG:-latest}"; PUSH=0; MULTI=0
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) IMAGE_REPO="$2"; shift ;;
    --tag) TAG="$2"; shift ;;
    --push) PUSH=1 ;;
    --multiarch) MULTI=1 ;;
    *) echo "unknown arg $1"; exit 1 ;;
  esac
  shift
done
export IMAGE_REPO TAG JWT_SECRET="${JWT_SECRET:-build-only}"
if [ "$MULTI" = 1 ]; then
  docker buildx inspect gamenight-builder >/dev/null 2>&1 || docker buildx create --name gamenight-builder --driver docker-container --use
  if [ "$PUSH" = 1 ]; then OUT="--push"; PLAT="linux/amd64,linux/arm64"
  else OUT="--load"; PLAT="linux/amd64"; echo "note: multi-arch cannot be loaded locally; building amd64 only (use --push)"; fi
  for app in server web; do
    TAGS="-t ${IMAGE_REPO}:gamenight-$app-$TAG"
    [ "$TAG" != latest ] && TAGS="$TAGS -t ${IMAGE_REPO}:gamenight-$app-latest"
    docker buildx build --builder gamenight-builder --platform "$PLAT" $OUT -f apps/$app/Dockerfile $TAGS .
  done
else
  docker compose -f docker-compose.prod.yml build server web
  for app in server web; do
    [ "$TAG" != latest ] && docker tag "${IMAGE_REPO}:gamenight-$app-$TAG" "${IMAGE_REPO}:gamenight-$app-latest"
    if [ "$PUSH" = 1 ]; then
      docker push "${IMAGE_REPO}:gamenight-$app-$TAG"
      [ "$TAG" != latest ] && docker push "${IMAGE_REPO}:gamenight-$app-latest"
    fi
  done
fi
true
