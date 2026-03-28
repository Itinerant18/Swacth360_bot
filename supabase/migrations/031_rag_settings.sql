-- Migration 031: Create rag_settings table
-- Required by /api/admin/rag-settings route
-- Single-row configuration table (id=1 always)

CREATE TABLE IF NOT EXISTS rag_settings (
    id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    use_hybrid_search   BOOLEAN NOT NULL DEFAULT true,
    use_reranker        BOOLEAN NOT NULL DEFAULT true,
    use_query_expansion BOOLEAN NOT NULL DEFAULT false,
    use_graph_boost     BOOLEAN NOT NULL DEFAULT false,
    top_k               INTEGER NOT NULL DEFAULT 10 CHECK (top_k BETWEEN 1 AND 50),
    alpha               DOUBLE PRECISION NOT NULL DEFAULT 0.5 CHECK (alpha BETWEEN 0.0 AND 1.0),
    mmr_lambda          DOUBLE PRECISION NOT NULL DEFAULT 0.5 CHECK (mmr_lambda BETWEEN 0.0 AND 1.0),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert the single default row
INSERT INTO rag_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- RLS: only service role can read/write
ALTER TABLE rag_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role rag_settings" ON rag_settings;
CREATE POLICY "Service role rag_settings"
    ON rag_settings FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
