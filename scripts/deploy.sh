#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)
HISTORY=.deploy-history

wait_ready() {
  for _ in $(seq 1 45); do
    if "${COMPOSE[@]}" exec -T api wget -qO- http://localhost:3000/api/v1/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

set_env_tag() {
  touch .env
  sed -i '/^APP_TAG=/d' .env
  echo "APP_TAG=$1" >> .env
}

previous="$(grep -E '^APP_TAG=' .env 2>/dev/null | tail -n 1 | cut -d= -f2 || true)"

git fetch --quiet
if git grep -qE '^(<<<<<<<|>>>>>>>)( |$)' '@{u}' -- .; then
  echo "merge conflict markers found in upstream, deploy aborted" >&2
  git grep -lE '^(<<<<<<<|>>>>>>>)( |$)' '@{u}' -- . >&2
  exit 1
fi
git merge --ff-only '@{u}'

sha="$(git rev-parse --short HEAD)"
export APP_TAG="$sha"

"${COMPOSE[@]}" build api web
"${COMPOSE[@]}" up -d api web

if ! wait_ready; then
  echo "api is not ready after 90s on $sha" >&2
  if [ -n "$previous" ]; then
    echo "roll back with: ./scripts/rollback.sh $previous" >&2
  fi
  exit 1
fi

set_env_tag "$sha"
echo "$sha" >> "$HISTORY"
echo "deployed $sha"
