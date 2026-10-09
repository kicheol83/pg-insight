#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)
HISTORY=.deploy-history

current="$(grep -E '^APP_TAG=' .env 2>/dev/null | tail -n 1 | cut -d= -f2 || true)"
previous="$(awk -v cur="${current:-}" '{ line[NR] = $0; if ($0 == cur) last = NR } END { for (i = last - 1; i > 0; i--) if (line[i] != cur) { print line[i]; exit } }' "$HISTORY" 2>/dev/null || true)"
target="${1:-$previous}"

if [ -z "$target" ]; then
  echo "no previous version in $HISTORY; pass a tag: ./scripts/rollback.sh <sha>" >&2
  exit 1
fi

for image in pg-insight-api pg-insight-web; do
  if ! docker image inspect "$image:$target" >/dev/null 2>&1; then
    echo "image $image:$target not found" >&2
    exit 1
  fi
done

export APP_TAG="$target"
"${COMPOSE[@]}" up -d --no-deps --force-recreate api web

for _ in $(seq 1 45); do
  if "${COMPOSE[@]}" exec -T api wget -qO- http://localhost:3000/api/v1/health >/dev/null 2>&1; then
    sed -i '/^APP_TAG=/d' .env
    echo "APP_TAG=$target" >> .env
    echo "rolled back from ${current:-unknown} to $target"
    exit 0
  fi
  sleep 2
done

echo "api is not ready after 90s on $target" >&2
exit 1
