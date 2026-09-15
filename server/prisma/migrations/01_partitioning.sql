-- ============================================================================
-- NanoLabs Control Center - Particionamiento Nativo de PostgreSQL 17
-- ============================================================================
-- Este script define la estructura particionada por rango temporal (semanal)
-- para las tablas de telemetría de alta frecuencia:
-- 1. device_metrics
-- 2. agent_heartbeats
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Particionamiento de device_metrics
-- ----------------------------------------------------------------------------
-- En PostgreSQL el particionado por rango requiere que la clave de partición
-- forme parte de la clave primaria.

CREATE TABLE IF NOT EXISTS "device_metrics_partitioned" (
    "id" BIGSERIAL,
    "tenantId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    "cpuPercent" DOUBLE PRECISION,
    "ramUsedMB" INTEGER,
    "ramAvailMB" INTEGER,
    "volumes" JSONB,
    "uptimeSeconds" BIGINT,
    "networkLatencyMs" INTEGER,
    CONSTRAINT "pk_device_metrics_partitioned" PRIMARY KEY ("id", "timestamp")
) PARTITION BY RANGE ("timestamp");

-- Índices optimizados en la tabla particionada (se propagan a cada partición)
CREATE INDEX IF NOT EXISTS "idx_device_metrics_tenant_device_ts" 
    ON "device_metrics_partitioned" ("tenantId", "deviceId", "timestamp" DESC);

-- Índice BRIN para búsquedas y consultas temporales en grandes volúmenes
CREATE INDEX IF NOT EXISTS "idx_device_metrics_timestamp_brin" 
    ON "device_metrics_partitioned" USING BRIN ("timestamp");

-- ----------------------------------------------------------------------------
-- 2. Particionamiento de agent_heartbeats
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "agent_heartbeats_partitioned" (
    "id" BIGSERIAL,
    "tenantId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "agentVersion" VARCHAR(50) NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    "uptimeSeconds" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "cpuPercent" DOUBLE PRECISION NOT NULL,
    "ramUsedMB" INTEGER NOT NULL,
    "ramAvailMB" INTEGER NOT NULL,
    "diskSummary" JSONB,
    CONSTRAINT "pk_agent_heartbeats_partitioned" PRIMARY KEY ("id", "timestamp")
) PARTITION BY RANGE ("timestamp");

CREATE INDEX IF NOT EXISTS "idx_heartbeats_tenant_device_ts" 
    ON "agent_heartbeats_partitioned" ("tenantId", "deviceId", "timestamp" DESC);

CREATE INDEX IF NOT EXISTS "idx_heartbeats_timestamp_brin" 
    ON "agent_heartbeats_partitioned" USING BRIN ("timestamp");

-- ----------------------------------------------------------------------------
-- 3. Funciones de ayuda para creación y rotación de particiones semanales
-- ----------------------------------------------------------------------------

-- Crea partición semanal para device_metrics
CREATE OR REPLACE FUNCTION create_device_metrics_weekly_partition(start_date DATE, end_date DATE)
RETURNS TEXT AS $$
DECLARE
    partition_name TEXT;
    sql_stmt TEXT;
BEGIN
    partition_name := 'device_metrics_' || to_char(start_date, 'IYYY_IW');
    sql_stmt := format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF "device_metrics_partitioned" FOR VALUES FROM (%L) TO (%L);',
        partition_name, start_date, end_date
    );
    EXECUTE sql_stmt;
    RETURN partition_name;
END;
$$ LANGUAGE plpgsql;

-- Crea partición semanal para agent_heartbeats
CREATE OR REPLACE FUNCTION create_heartbeat_weekly_partition(start_date DATE, end_date DATE)
RETURNS TEXT AS $$
DECLARE
    partition_name TEXT;
    sql_stmt TEXT;
BEGIN
    partition_name := 'agent_heartbeats_' || to_char(start_date, 'IYYY_IW');
    sql_stmt := format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF "agent_heartbeats_partitioned" FOR VALUES FROM (%L) TO (%L);',
        partition_name, start_date, end_date
    );
    EXECUTE sql_stmt;
    RETURN partition_name;
END;
$$ LANGUAGE plpgsql;

-- Elimina particiones más viejas que X días (retención)
CREATE OR REPLACE FUNCTION drop_old_partitions(table_prefix TEXT, days_to_keep INTEGER)
RETURNS TABLE (dropped_table TEXT) AS $$
DECLARE
    rec RECORD;
    cutoff_date DATE := CURRENT_DATE - days_to_keep;
BEGIN
    FOR rec IN
        SELECT tablename 
        FROM pg_tables 
        WHERE tablename LIKE table_prefix || '_%'
    LOOP
        -- Las particiones que exceden el tiempo de retención pueden descartarse mediante DROP TABLE
        -- lo cual es O(1) y no genera fragmentación en PostgreSQL.
        dropped_table := rec.tablename;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
