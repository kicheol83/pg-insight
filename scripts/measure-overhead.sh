#!/usr/bin/env bash
set -euo pipefail

WINDOW_SECONDS="${WINDOW_SECONDS:-600}"
TARGET_CONTAINER="${TARGET_CONTAINER:-ledgercore-postgres-1}"
TARGET_USER="${TARGET_USER:-ledger}"
TARGET_DB="${TARGET_DB:-ledgercore}"
METRICS_CONTAINER="${METRICS_CONTAINER:-pg-insight-metrics-db-1}"
MONITOR_ROLE="${MONITOR_ROLE:-insight_monitor}"
OUT="${OUT:-$HOME/pg-insight-overhead-$(date +%Y%m%d-%H%M).txt}"

target_sql() {
  docker exec -i "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -X -v ON_ERROR_STOP=1 "$@"
}

metrics_sql() {
  docker exec -i "$METRICS_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -v ON_ERROR_STOP=1 "$@"' psql "$@"
}

{
  echo "# PG Insight overhead on a monitored database"
  echo "started: $(date -u +%FT%TZ)  window: ${WINDOW_SECONDS}s  target: ${TARGET_CONTAINER}/${TARGET_DB}"
  echo
  echo "## server"
  nproc
  free -m | head -2
  target_sql -tAc "SELECT version()"
} | tee "$OUT"

target_sql -tAc "SELECT pg_stat_statements_reset()" >/dev/null
CPU_BEFORE=$(docker exec "$TARGET_CONTAINER" sh -c 'cat /sys/fs/cgroup/cpu.stat 2>/dev/null | grep usage_usec || echo usage_usec 0' | awk '{print $2}')
sleep "$WINDOW_SECONDS"
CPU_AFTER=$(docker exec "$TARGET_CONTAINER" sh -c 'cat /sys/fs/cgroup/cpu.stat 2>/dev/null | grep usage_usec || echo usage_usec 0' | awk '{print $2}')

{
  echo
  echo "## container CPU of $TARGET_CONTAINER over the window"
  awk -v b="$CPU_BEFORE" -v a="$CPU_AFTER" -v w="$WINDOW_SECONDS" \
    'BEGIN { printf "cpu_seconds=%.2f  avg_cores=%.4f\n", (a-b)/1e6, (a-b)/1e6/w }'

  echo
  echo "## statements by role (pg_stat_statements since reset)"
  target_sql <<'SQL'
SELECT r.rolname,
       count(*)                                         AS statements,
       sum(s.calls)                                     AS calls,
       round(sum(s.total_exec_time)::numeric, 1)        AS total_exec_ms,
       round((sum(s.total_exec_time) / nullif(sum(s.calls), 0))::numeric, 3) AS mean_ms,
       sum(s.shared_blks_hit + s.shared_blks_read)     AS blocks_touched,
       sum(s.temp_blks_written)                         AS temp_blks_written
  FROM pg_stat_statements s
  JOIN pg_roles r ON r.oid = s.userid
 GROUP BY r.rolname
 ORDER BY total_exec_ms DESC;
SQL

  echo
  echo "## top $MONITOR_ROLE statements by total time"
  target_sql -v role="$MONITOR_ROLE" <<'SQL'
SELECT s.calls,
       round(s.total_exec_time::numeric, 1) AS total_ms,
       round(s.mean_exec_time::numeric, 3)  AS mean_ms,
       round(s.max_exec_time::numeric, 2)   AS max_ms,
       left(regexp_replace(s.query, '\s+', ' ', 'g'), 110) AS query
  FROM pg_stat_statements s
  JOIN pg_roles r ON r.oid = s.userid
 WHERE r.rolname = :'role'
 ORDER BY s.total_exec_time DESC
 LIMIT 8;
SQL

  echo
  echo "## connections held by PG Insight on the target"
  target_sql -c "SELECT state, count(*) FROM pg_stat_activity WHERE usename = '${MONITOR_ROLE}' GROUP BY state;"
  target_sql -tAc "SELECT 'max_connections=' || current_setting('max_connections');"

  echo
  echo "## metrics store size and growth"
  metrics_sql <<'SQL'
SELECT h.hypertable_name,
       pg_size_pretty(hypertable_size(format('%I.%I', h.hypertable_schema, h.hypertable_name)::regclass)) AS size,
       (SELECT count(*) FROM timescaledb_information.chunks c
         WHERE c.hypertable_name = h.hypertable_name) AS chunks
  FROM timescaledb_information.hypertables h
 ORDER BY hypertable_size(format('%I.%I', h.hypertable_schema, h.hypertable_name)::regclass) DESC;
SQL
  metrics_sql -tAc "SELECT 'database_size=' || pg_size_pretty(pg_database_size(current_database()));"
  metrics_sql -tAc "SELECT 'connection_metrics_rows_last_24h=' || count(*) FROM connection_metrics WHERE time > now() - interval '24 hours';"
  metrics_sql -tAc "SELECT 'oldest_row=' || min(time) FROM connection_metrics;"
  metrics_sql -tAc "SELECT 'retention_policies=' || count(*) FROM timescaledb_information.jobs WHERE proc_name = 'policy_retention';"
  metrics_sql -tAc "SELECT 'compression_policies=' || count(*) FROM timescaledb_information.jobs WHERE proc_name = 'policy_compression';"

  echo
  echo "finished: $(date -u +%FT%TZ)"
} | tee -a "$OUT"

echo
echo "saved: $OUT"
