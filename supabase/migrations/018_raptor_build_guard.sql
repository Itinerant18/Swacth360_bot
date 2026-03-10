-- Prevent overlapping RAPTOR builds and tag rows by build for exact accounting.

ALTER TABLE raptor_clusters
    ADD COLUMN IF NOT EXISTS build_id UUID REFERENCES raptor_build_log(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS raptor_clusters_build_id_idx
    ON raptor_clusters (build_id);

CREATE UNIQUE INDEX IF NOT EXISTS raptor_build_log_running_unique_idx
    ON raptor_build_log (status)
    WHERE status = 'running';
