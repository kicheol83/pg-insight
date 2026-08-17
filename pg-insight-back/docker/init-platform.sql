CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm; 


CREATE TABLE IF NOT EXISTS connection_metrics (
    time                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_id             UUID NOT NULL,
    total                 INT NOT NULL,
    active                INT NOT NULL,
    idle                  INT NOT NULL,
    idle_in_tx            INT NOT NULL,
    waiting               INT NOT NULL,
    max_connections       INT NOT NULL,
    utilization_pct       FLOAT NOT NULL,
    longest_query_ms      BIGINT NOT NULL DEFAULT 0,
    longest_idle_in_tx_ms BIGINT NOT NULL DEFAULT 0
);

SELECT create_hypertable(
    'connection_metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_conn_metrics_target_time
ON connection_metrics (target_id, time DESC);

CREATE TABLE IF NOT EXISTS connection_by_app (
    time      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_id UUID NOT NULL,
    app_name  TEXT NOT NULL,
    count     INT NOT NULL
);

SELECT create_hypertable(
    'connection_by_app', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);


CREATE TABLE IF NOT EXISTS lock_metrics (
    time                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_id           UUID NOT NULL,
    total_locks         INT NOT NULL DEFAULT 0,
    waiting_locks       INT NOT NULL DEFAULT 0,
    granted_locks       INT NOT NULL DEFAULT 0,
    has_blockers        BOOLEAN NOT NULL DEFAULT FALSE,
    has_deadlock_risk   BOOLEAN NOT NULL DEFAULT FALSE,
    deadlocks_total     BIGINT NOT NULL DEFAULT 0
);

SELECT create_hypertable(
    'lock_metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE TABLE IF NOT EXISTS lock_events (
    time          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_id     UUID NOT NULL,
    blocker_pid   INT NOT NULL,
    blocker_query TEXT,
    waiter_count  INT NOT NULL DEFAULT 0,
    lock_mode     TEXT NOT NULL,
    relation_name TEXT,
    severity      TEXT NOT NULL DEFAULT 'low',
    max_wait_ms   BIGINT NOT NULL DEFAULT 0
);

SELECT create_hypertable(
    'lock_events', 'time',
    chunk_time_interval => INTERVAL '1 hour',  
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_lock_events_target_time
ON lock_events (target_id, time DESC);

CREATE TABLE IF NOT EXISTS query_metrics (
    time            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_id       UUID NOT NULL,
    query_id        TEXT NOT NULL,    
    query_text      TEXT,
    calls           BIGINT NOT NULL,
    total_time_ms   DOUBLE PRECISION NOT NULL,
    mean_time_ms    DOUBLE PRECISION NOT NULL,
    max_time_ms     DOUBLE PRECISION NOT NULL,
    stddev_time_ms  DOUBLE PRECISION NOT NULL,
    rows_total      BIGINT NOT NULL DEFAULT 0,
    cache_hit_ratio DOUBLE PRECISION NOT NULL DEFAULT 1,
    wal_bytes       BIGINT NOT NULL DEFAULT 0,
    tags            TEXT DEFAULT ''   
);

SELECT create_hypertable(
    'query_metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_query_metrics_target_time
ON query_metrics (target_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_query_metrics_query_id
ON query_metrics (target_id, query_id, time DESC);


CREATE TABLE IF NOT EXISTS table_metrics (
    time             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_id        UUID NOT NULL,
    table_name       TEXT NOT NULL,    -- "schema.table"
    live_tuples      BIGINT NOT NULL DEFAULT 0,
    dead_tuples      BIGINT NOT NULL DEFAULT 0,
    bloat_ratio      DOUBLE PRECISION NOT NULL DEFAULT 0,
    seq_scans        BIGINT NOT NULL DEFAULT 0,
    idx_scans        BIGINT NOT NULL DEFAULT 0,
    seq_scan_ratio   DOUBLE PRECISION NOT NULL DEFAULT 0,
    rows_inserted    BIGINT NOT NULL DEFAULT 0,
    rows_updated     BIGINT NOT NULL DEFAULT 0,
    rows_deleted     BIGINT NOT NULL DEFAULT 0,
    total_size_bytes BIGINT NOT NULL DEFAULT 0
);

SELECT create_hypertable(
    'table_metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_table_metrics_target_name
ON table_metrics (target_id, table_name, time DESC);

CREATE TABLE IF NOT EXISTS vacuum_metrics (
    time                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_id              UUID NOT NULL,
    active_vacuums         INT NOT NULL DEFAULT 0,
    max_xid_age            BIGINT NOT NULL DEFAULT 0,
    database_age           BIGINT NOT NULL DEFAULT 0,
    has_xid_risk           BOOLEAN NOT NULL DEFAULT FALSE,
    autovacuum_workers     INT NOT NULL DEFAULT 0,
    tables_pending_vacuum  INT NOT NULL DEFAULT 0
);

SELECT create_hypertable(
    'vacuum_metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE TABLE IF NOT EXISTS replication_metrics (
    time                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_id             UUID NOT NULL,
    is_primary            BOOLEAN NOT NULL DEFAULT TRUE,
    replica_count         INT NOT NULL DEFAULT 0,
    max_lag_bytes         BIGINT NOT NULL DEFAULT 0,
    has_inactive_slots    BOOLEAN NOT NULL DEFAULT FALSE,
    total_wal_retained    BIGINT NOT NULL DEFAULT 0,
    has_lagged_replicas   BOOLEAN NOT NULL DEFAULT FALSE
);

SELECT create_hypertable(
    'replication_metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE TABLE IF NOT EXISTS replica_lag (
    time                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_id           UUID NOT NULL,
    client_addr         TEXT NOT NULL,
    application_name    TEXT NOT NULL DEFAULT '',
    state               TEXT NOT NULL DEFAULT '',
    sync_state          TEXT NOT NULL DEFAULT 'async',
    write_lag_bytes     BIGINT NOT NULL DEFAULT 0,
    flush_lag_bytes     BIGINT NOT NULL DEFAULT 0,
    replay_lag_bytes    BIGINT NOT NULL DEFAULT 0,
    total_lag_bytes     BIGINT NOT NULL DEFAULT 0,
    replay_lag_ms       BIGINT
);

SELECT create_hypertable(
    'replica_lag', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE TABLE IF NOT EXISTS io_buffer_metrics (
    time                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    target_id             UUID NOT NULL,
    cache_hit_ratio       DOUBLE PRECISION NOT NULL DEFAULT 1,
    blks_read             BIGINT NOT NULL DEFAULT 0,
    blks_hit              BIGINT NOT NULL DEFAULT 0,
    checkpoints_timed     BIGINT NOT NULL DEFAULT 0,
    checkpoints_req       BIGINT NOT NULL DEFAULT 0,
    buffers_checkpoint    BIGINT NOT NULL DEFAULT 0,
    buffers_clean         BIGINT NOT NULL DEFAULT 0,
    buffers_backend       BIGINT NOT NULL DEFAULT 0,
    buffers_backend_fsync BIGINT NOT NULL DEFAULT 0,
    max_written_clean     BIGINT NOT NULL DEFAULT 0,
    is_healthy            BOOLEAN NOT NULL DEFAULT TRUE
);

SELECT create_hypertable(
    'io_buffer_metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);


CREATE TABLE IF NOT EXISTS system_info (
    target_id           UUID PRIMARY KEY,
    time                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pg_version          TEXT NOT NULL,
    pg_version_num      INT NOT NULL,
    max_connections     INT NOT NULL,
    shared_buffers_mb   INT NOT NULL,
    extension_list      TEXT,
    database_count      INT NOT NULL DEFAULT 1,
    superuser_count     INT NOT NULL DEFAULT 1,
    total_db_size_bytes BIGINT NOT NULL DEFAULT 0,
    config_issues_count INT NOT NULL DEFAULT 0
);



DO $$ BEGIN
  ALTER TABLE connection_metrics SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'target_id',
      timescaledb.compress_orderby   = 'time DESC'
  );
  PERFORM add_compression_policy(
      'connection_metrics', INTERVAL '7 days', if_not_exists => TRUE
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Compression policy skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE query_metrics SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'target_id',
      timescaledb.compress_orderby   = 'time DESC'
  );
  PERFORM add_compression_policy(
      'query_metrics', INTERVAL '7 days', if_not_exists => TRUE
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Compression policy skipped: %', SQLERRM;
END $$;



DO $$ BEGIN
  PERFORM add_retention_policy('connection_metrics', INTERVAL '30 days', if_not_exists => TRUE);
  PERFORM add_retention_policy('lock_metrics',       INTERVAL '14 days', if_not_exists => TRUE);
  PERFORM add_retention_policy('lock_events',        INTERVAL '7 days',  if_not_exists => TRUE);
  PERFORM add_retention_policy('query_metrics',      INTERVAL '30 days', if_not_exists => TRUE);
  PERFORM add_retention_policy('table_metrics',      INTERVAL '30 days', if_not_exists => TRUE);
  PERFORM add_retention_policy('vacuum_metrics',     INTERVAL '30 days', if_not_exists => TRUE);
  PERFORM add_retention_policy('replication_metrics', INTERVAL '30 days', if_not_exists => TRUE);
  PERFORM add_retention_policy('replica_lag',        INTERVAL '14 days', if_not_exists => TRUE);
  PERFORM add_retention_policy('io_buffer_metrics',  INTERVAL '14 days', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Retention policy skipped: %', SQLERRM;
END $$;


CREATE MATERIALIZED VIEW IF NOT EXISTS conn_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time)  AS bucket,
    target_id,
    AVG(total)::INT              AS avg_total,
    MAX(total)                   AS max_total,
    AVG(active)::INT             AS avg_active,
    MAX(active)                  AS max_active,
    AVG(utilization_pct)         AS avg_utilization_pct,
    MAX(utilization_pct)         AS max_utilization_pct,
    MAX(longest_query_ms)        AS max_query_ms,
    COUNT(*)                     AS sample_count
FROM connection_metrics
GROUP BY bucket, target_id
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS query_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time)   AS bucket,
    target_id,
    query_id,
    LAST(query_text, time)        AS query_text,
    MAX(calls)                    AS max_calls,
    AVG(mean_time_ms)             AS avg_mean_ms,
    MAX(max_time_ms)              AS peak_max_ms,
    AVG(cache_hit_ratio)          AS avg_cache_hit,
    COUNT(*)                      AS sample_count
FROM query_metrics
GROUP BY bucket, target_id, query_id
WITH NO DATA;

DO $$ BEGIN
  PERFORM add_continuous_aggregate_policy(
      'conn_metrics_hourly',
      start_offset  => INTERVAL '3 hours',
      end_offset    => INTERVAL '1 minute',
      schedule_interval => INTERVAL '1 hour',
      if_not_exists => TRUE
  );
  PERFORM add_continuous_aggregate_policy(
      'query_metrics_hourly',
      start_offset  => INTERVAL '3 hours',
      end_offset    => INTERVAL '5 minutes',
      schedule_interval => INTERVAL '1 hour',
      if_not_exists => TRUE
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Continuous aggregate policy skipped: %', SQLERRM;
END $$;


CREATE OR REPLACE VIEW latest_connections AS
SELECT DISTINCT ON (target_id)
    target_id, time, total, active, idle,
    idle_in_tx, waiting, max_connections, utilization_pct,
    longest_query_ms, longest_idle_in_tx_ms
FROM connection_metrics
ORDER BY target_id, time DESC;

CREATE OR REPLACE VIEW slow_queries_last_hour AS
SELECT
    target_id,
    query_id,
    LAST(query_text, time)    AS query_text,
    MAX(mean_time_ms)         AS peak_mean_ms,
    AVG(mean_time_ms)         AS avg_mean_ms,
    SUM(calls)                AS total_calls,
    AVG(cache_hit_ratio)      AS avg_cache_hit,
    LAST(tags, time)          AS tags
FROM query_metrics
WHERE time >= NOW() - INTERVAL '1 hour'
  AND mean_time_ms >= 100
GROUP BY target_id, query_id
ORDER BY peak_mean_ms DESC;

CREATE OR REPLACE VIEW active_blocking_chains AS
SELECT *
FROM lock_events
WHERE time >= NOW() - INTERVAL '5 minutes'
  AND severity IN ('high', 'critical')
ORDER BY max_wait_ms DESC;

DO $$ BEGIN
  RAISE NOTICE '✅ Platform DB schema initialized successfully';
END $$;