-- ============================================================
-- MIGRATION 013 — Enhanced RAG Capabilities
-- 
-- Features:
-- 1. Hybrid Search (Vector + BM25)
-- 2. Parent-Child Chunking Support
-- 3. Retrieval Feedback System
-- 4. Knowledge Graph (Entity Relationships)
-- ============================================================

-- ============================================================
-- PARENT-CHILD CHUNKING SUPPORT
-- ============================================================
ALTER TABLE hms_knowledge 
ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES hms_knowledge(id);

ALTER TABLE hms_knowledge 
ADD COLUMN IF NOT EXISTS chunk_level TEXT DEFAULT 'child' 
CHECK (chunk_level IN ('parent', 'child'));

CREATE INDEX IF NOT EXISTS hms_knowledge_parent_idx ON hms_knowledge(parent_id);
CREATE INDEX IF NOT EXISTS hms_knowledge_chunk_level_idx ON hms_knowledge(chunk_level);

-- ============================================================
-- 2. HYBRID SEARCH (VECTOR + BM25)
-- ============================================================

-- Add BM25 search capabilities
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index for trigram similarity (used in BM25 fallback)
CREATE INDEX IF NOT EXISTS hms_knowledge_trgm_idx ON hms_knowledge USING gin (question gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hms_knowledge_content_trgm_idx ON hms_knowledge USING gin (content gin_trgm_ops);

-- Full-text search index
CREATE INDEX IF NOT EXISTS hms_knowledge_fts_idx ON hms_knowledge 
USING GIN (to_tsvector('english', COALESCE(question, '') || ' ' || COALESCE(content, '')));

-- Hybrid search function combining vector + BM25
CREATE OR REPLACE FUNCTION hybrid_search_hms(
    query_text TEXT,
    query_vector vector(1536),
    alpha FLOAT DEFAULT 0.5,
    top_k INT DEFAULT 10,
    similarity_threshold FLOAT DEFAULT 0.15
)
RETURNS TABLE (
    id TEXT,
    question TEXT,
    answer TEXT,
    category TEXT,
    subcategory TEXT,
    content TEXT,
    source TEXT,
    source_name TEXT,
    chunk_type TEXT,
    entities TEXT[],
    similarity FLOAT,
    hybrid_score FLOAT,
    rank_position INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH bm25_results AS (
        SELECT 
            k.id,
            k.question,
            k.answer,
            k.category,
            k.subcategory,
            k.content,
            k.source,
            k.source_name,
            COALESCE(k.chunk_type, 'chunk') as chunk_type,
            COALESCE(k.entities, '{}') as entities,
            COALESCE(
                ts_rank(to_tsvector('english', COALESCE(k.question, '') || ' ' || COALESCE(k.content, '')), 
                plainto_tsquery('english', query_text))
            , 0) as bm25_score
        FROM hms_knowledge k
        WHERE k.content IS NOT NULL
          AND to_tsvector('english', COALESCE(k.question, '') || ' ' || COALESCE(k.content, '')) 
          @@ plainto_tsquery('english', query_text)
          AND COALESCE(k.is_archived, FALSE) = FALSE
    ),
    vector_results AS (
        SELECT 
            k.id,
            k.question,
            k.answer,
            k.category,
            k.subcategory,
            k.content,
            k.source,
            k.source_name,
            COALESCE(k.chunk_type, 'chunk') as chunk_type,
            COALESCE(k.entities, '{}') as entities,
            (1 - (k.embedding <=> query_vector))::FLOAT as vector_score
        FROM hms_knowledge k
        WHERE k.embedding IS NOT NULL
          AND (1 - (k.embedding <=> query_vector)) > similarity_threshold
          AND COALESCE(k.is_archived, FALSE) = FALSE
    ),
    normalized AS (
        SELECT 
            v.id,
            v.question,
            v.answer,
            v.category,
            v.subcategory,
            v.content,
            v.source,
            v.source_name,
            v.chunk_type,
            v.entities,
            v.vector_score,
            b.bm25_score,
            -- Normalize BM25 to 0-1 range (approximate)
            CASE 
                WHEN MAX(b.bm25_score) OVER() > 0 
                THEN b.bm25_score / MAX(b.bm25_score) OVER() 
                ELSE 0 
            END as normalized_bm25,
            CASE 
                WHEN MAX(v.vector_score) OVER() > 0 
                THEN v.vector_score 
                ELSE 0 
            END as normalized_vector
        FROM vector_results v
        LEFT JOIN bm25_results b ON v.id = b.id
    )
    SELECT 
        n.id,
        n.question,
        n.answer,
        n.category,
        n.subcategory,
        n.content,
        n.source,
        n.source_name,
        n.chunk_type,
        n.entities,
        n.vector_score as similarity,
        (COALESCE(n.normalized_vector, 0) * alpha + COALESCE(n.normalized_bm25, 0) * (1 - alpha))::FLOAT as hybrid_score,
        ROW_NUMBER() OVER(ORDER BY (COALESCE(n.normalized_vector, 0) * alpha + COALESCE(n.normalized_bm25, 0)) DESC) as rank_position
    FROM normalized n
    ORDER BY hybrid_score DESC
    LIMIT top_k;
END;
$$;

-- ============================================================
-- 3. RETRIEVAL FEEDBACK SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS retrieval_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_text TEXT NOT NULL,
    result_id TEXT NOT NULL,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    is_relevant BOOLEAN,
    feedback_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analyzing feedback
CREATE INDEX IF NOT EXISTS retrieval_feedback_created_idx ON retrieval_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS retrieval_feedback_result_idx ON retrieval_feedback(result_id);

-- RLS
ALTER TABLE retrieval_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon feedback" ON retrieval_feedback;
CREATE POLICY "Allow anon feedback" ON retrieval_feedback 
FOR ALL TO anon USING (true) WITH CHECK (true);

-- Function to get feedback-boosted results
CREATE OR REPLACE FUNCTION get_boosted_results(
    query_vector vector(1536),
    days_since INT DEFAULT 30,
    boost_weight FLOAT DEFAULT 0.15
)
RETURNS TABLE(id TEXT, boost_score FLOAT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        k.id,
        COALESCE(AVG(CASE f.rating WHEN 5 THEN 1.0 WHEN 4 THEN 0.75 WHEN 3 THEN 0.5 WHEN 2 THEN 0.25 ELSE 0 END), 0) * boost_weight as boost_score
    FROM hms_knowledge k
    LEFT JOIN retrieval_feedback f ON k.id = f.result_id
    WHERE f.created_at > NOW() - (days_since || ' days')::INTERVAL
    GROUP BY k.id;
END;
$$;

-- ============================================================
-- 4. KNOWLEDGE GRAPH (ENTITY RELATIONSHIPS)
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_graph (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_a TEXT NOT NULL,
    entity_b TEXT NOT NULL,
    relationship TEXT NOT NULL,
    confidence FLOAT DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
    source_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for graph traversal
CREATE INDEX IF NOT EXISTS knowledge_graph_entities_idx ON knowledge_graph(entity_a, entity_b);
CREATE INDEX IF NOT EXISTS knowledge_graph_entity_a_idx ON knowledge_graph(entity_a);
CREATE INDEX IF NOT EXISTS knowledge_graph_entity_b_idx ON knowledge_graph(entity_b);

-- RLS
ALTER TABLE knowledge_graph ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon knowledge_graph" ON knowledge_graph;
CREATE POLICY "Allow anon knowledge_graph" ON knowledge_graph 
FOR ALL TO anon USING (true) WITH CHECK (true);

-- Function to find related entities
CREATE OR REPLACE FUNCTION find_related_entities(
    entity TEXT,
    max_results INT DEFAULT 10
)
RETURNS TABLE(entity_b TEXT, relationship TEXT, confidence FLOAT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        kg.entity_b,
        kg.relationship,
        kg.confidence
    FROM knowledge_graph kg
    WHERE kg.entity_a = entity
    ORDER BY kg.confidence DESC
    LIMIT max_results;
END;
$$;

-- Function to find path between two entities (for multi-hop reasoning)
CREATE OR REPLACE FUNCTION find_entity_path(
    start_entity TEXT,
    end_entity TEXT,
    max_hops INT DEFAULT 3
)
RETURNS TABLE(path TEXT[], confidence FLOAT)
LANGUAGE plpgsql
AS $$
DECLARE
    current_entity TEXT := start_entity;
    path_array TEXT[] := ARRAY[start_entity];
    total_confidence FLOAT := 1.0;
    hop INT := 0;
    next_entities CURSOR FOR 
        SELECT entity_b, relationship, confidence 
        FROM knowledge_graph 
        WHERE entity_a = current_entity;
BEGIN
    LOOP
        hop := hop + 1;
        EXIT WHEN hop > max_hops;
        
        FOR rec IN next_entities LOOP
            path_array := array_append(path_array, rec.entity_b);
            total_confidence := total_confidence * rec.confidence;
            
            IF rec.entity_b = end_entity THEN
                RETURN QUERY SELECT path_array, total_confidence;
                RETURN;
            END IF;
            
            current_entity := rec.entity_b;
        END LOOP;
    END LOOP;
    
    -- Return best effort path
    RETURN QUERY SELECT path_array, total_confidence;
END;
$$;

-- ============================================================
-- 5. IMPROVED MMR WITH KNOWLEDGE GRAPH
-- ============================================================

CREATE OR REPLACE FUNCTION mmr_with_graph_boost(
    query_vector vector(1536),
    query_entities TEXT[],
    similarity_threshold FLOAT DEFAULT 0.20,
    match_count INT DEFAULT 10,
    mmr_lambda FLOAT DEFAULT 0.5,
    graph_boost_weight FLOAT DEFAULT 0.1
)
RETURNS TABLE (
    id TEXT,
    question TEXT,
    answer TEXT,
    category TEXT,
    subcategory TEXT,
    content TEXT,
    source TEXT,
    source_name TEXT,
    chunk_type TEXT,
    entities TEXT[],
    similarity FLOAT,
    mmr_score FLOAT,
    rank_position INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH scored AS (
        SELECT 
            k.id,
            k.question,
            k.answer,
            k.category,
            k.subcategory,
            k.content,
            k.source,
            k.source_name,
            COALESCE(k.chunk_type, 'chunk') as chunk_type,
            COALESCE(k.entities, '{}') as entities,
            (1 - (k.embedding <=> query_vector))::FLOAT as similarity,
            -- Graph boost for related entities
            COALESCE(
                (SELECT MAX(kg.confidence * graph_boost_weight)
                 FROM knowledge_graph kg
                 WHERE kg.entity_a = ANY(query_entities)
                   AND kg.entity_b = ANY(k.entities)), 
                0
            ) as graph_boost,
            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - k.created_at)) / 86400 as days_old
        FROM hms_knowledge k
        WHERE k.embedding IS NOT NULL
          AND COALESCE(k.is_archived, FALSE) = FALSE
          AND (1 - (k.embedding <=> query_vector)) > similarity_threshold
    )
    SELECT 
        s.id, s.question, s.answer, s.category, s.subcategory,
        s.content, s.source, s.source_name, s.chunk_type, s.entities,
        s.similarity,
        (s.similarity * (1 - mmr_lambda) + 
         s.similarity * mmr_lambda - 
         s.graph_boost) * CASE 
            WHEN s.days_old < 30 THEN 1.15 
            WHEN s.days_old < 90 THEN 1.0 
            ELSE 0.95 
        END as mmr_score,
        ROW_NUMBER() OVER(ORDER BY s.similarity DESC) as rank_position
    FROM scored s
    ORDER BY s.similarity DESC
    LIMIT match_count;
END;
$$;

-- ============================================================
-- VERIFICATION
-- ============================================================
SELECT 'Migration 013 complete!' as status;

-- Verify functions created
SELECT 'Functions created:' as status;
SELECT proname FROM pg_proc WHERE proname IN (
    'hybrid_search_hms',
    'get_boosted_results',
    'find_related_entities',
    'find_entity_path',
    'mmr_with_graph_boost'
);

-- Verify tables created
SELECT 'Tables created:' as status;
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('retrieval_feedback', 'knowledge_graph');

-- Test hybrid search
SELECT 'Test hybrid search:' as status;
-- SELECT * FROM hybrid_search_hms('error E001 troubleshooting', NULL::vector, 0.5, 5);
