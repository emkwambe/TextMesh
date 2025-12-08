-- =================================
-- TEXTMESH DATABASE INITIALIZATION
-- This script runs when PostgreSQL container starts
-- =================================

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE textmesh TO textmesh;

-- Create schemas (if using multi-tenancy)
-- CREATE SCHEMA IF NOT EXISTS app;

-- Note: Tables are created by Prisma migrations
-- This file is for database-level setup only

-- Performance tuning for search
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '768MB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET max_worker_processes = 4;
ALTER SYSTEM SET max_parallel_workers_per_gather = 2;
ALTER SYSTEM SET max_parallel_workers = 4;

-- Connection tuning
ALTER SYSTEM SET max_connections = 200;

-- Logging (useful for debugging)
ALTER SYSTEM SET log_statement = 'none';
ALTER SYSTEM SET log_duration = off;
ALTER SYSTEM SET log_min_duration_statement = 1000;

-- WAL settings for better write performance
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;

-- Apply settings
SELECT pg_reload_conf();
