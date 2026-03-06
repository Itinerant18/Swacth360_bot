/**
 * src/lib/knowledge-graph.ts
 * 
 * Knowledge Graph Module for Enhanced RAG
 * 
 * Features:
 * - Entity relationship management
 * - Multi-hop reasoning
 * - Graph-based retrieval boosting
 */

import { getSupabase } from './supabase';

export interface Entity {
    name: string;
    type: string;
    aliases?: string[];
}

export interface Relationship {
    entityA: string;
    entityB: string;
    relationship: string;
    confidence: number;
    sourceId?: string;
}

export interface GraphPath {
    path: string[];
    confidence: number;
}

/**
 * Add entities to the knowledge graph
 */
export async function addEntities(entities: Entity[]): Promise<void> {
    const supabase = getSupabase();

    // Get existing entities to check for duplicates
    const { data: existing } = await supabase
        .from('knowledge_graph')
        .select('entity_a, entity_b');

    const existingSet = new Set(
        (existing || []).map((e) => `${e.entity_a}|${e.entity_b}`)
    );

    const newRelations: Relationship[] = [];

    // Generate relationships between entities
    for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
            const a = entities[i];
            const b = entities[j];

            // Skip if relationship already exists
            const key = `${a.name}|${b.name}`;
            if (existingSet.has(key)) continue;

            // Determine relationship type based on entity types
            const relationship = determineRelationship(a, b);
            if (relationship) {
                newRelations.push({
                    entityA: a.name,
                    entityB: b.name,
                    relationship: relationship.type,
                    confidence: relationship.confidence,
                });
            }

            // Also add reverse relationship
            if (a.aliases?.includes(b.name) || b.aliases?.includes(a.name)) {
                newRelations.push({
                    entityA: b.name,
                    entityB: a.name,
                    relationship: 'same_as',
                    confidence: 1.0,
                });
            }
        }
    }

    if (newRelations.length > 0) {
        const { error } = await supabase.from('knowledge_graph').insert(
            newRelations.map((r) => ({
                entity_a: r.entityA,
                entity_b: r.entityB,
                relationship: r.relationship,
                confidence: r.confidence,
                source_id: r.sourceId,
            }))
        );

        if (error) {
            console.warn('⚠️  Failed to add entity relationships:', error);
        }
    }
}

/**
 * Determine relationship between two entities
 */
function determineRelationship(
    a: Entity,
    b: Entity
): { type: string; confidence: number } | null {
    // Device - Component relationship
    if (
        (a.type === 'device' && b.type === 'component') ||
        (a.type === 'component' && b.type === 'device')
    ) {
        return { type: 'part_of', confidence: 0.9 };
    }

    // Error - Cause relationship
    if (a.type === 'error' && b.type === 'cause') {
        return { type: 'caused_by', confidence: 0.8 };
    }

    // Error - Solution relationship
    if (a.type === 'error' && b.type === 'solution') {
        return { type: 'resolved_by', confidence: 0.85 };
    }

    // Protocol relationships
    if (a.type === 'protocol' && b.type === 'protocol') {
        return { type: 'compatible_with', confidence: 0.7 };
    }

    // Terminal connections
    if (a.type === 'terminal' && b.type === 'terminal') {
        return { type: 'connected_to', confidence: 0.8 };
    }

    return null;
}

/**
 * Find related entities
 */
export async function findRelatedEntities(
    entity: string,
    maxResults: number = 10
): Promise<Relationship[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase.rpc('find_related_entities', {
        entity,
        max_results: maxResults,
    });

    if (error) {
        console.warn('⚠️  Failed to find related entities:', error);
        return [];
    }

    return (data || []).map((r: any) => ({
        entityA: entity,
        entityB: r.entity_b,
        relationship: r.relationship,
        confidence: r.confidence,
    }));
}

/**
 * Find path between two entities (multi-hop reasoning)
 */
export async function findPath(
    startEntity: string,
    endEntity: string,
    maxHops: number = 3
): Promise<GraphPath | null> {
    const supabase = getSupabase();

    const { data, error } = await supabase.rpc('find_entity_path', {
        start_entity: startEntity,
        end_entity: endEntity,
        max_hops: maxHops,
    });

    if (error || !data || data.length === 0) {
        return null;
    }

    return {
        path: data[0].path,
        confidence: data[0].confidence,
    };
}

/**
 * Extract entities from text using pattern matching
 */
export function extractEntities(text: string): Entity[] {
    const entities: Entity[] = [];
    const lowerText = text.toLowerCase();

    // Error codes (E001, E002, etc.)
    const errorCodes = text.match(/\b[Ee]\d{3,4}\b/g) || [];
    errorCodes.forEach((code) => {
        entities.push({ name: code.toUpperCase(), type: 'error' });
    });

    // Terminals (TB1+, TB2-, etc.)
    const terminals = text.match(/\b[Tt][Bb]\d+[+-]?\b/g) || [];
    terminals.forEach((term) => {
        entities.push({ name: term.toUpperCase(), type: 'terminal' });
    });

    // Models (HMS-123, ABC-456, etc.)
    const models = text.match(/\b(hms|abc|anybus|x-gateway)-\d+\b/gi) || [];
    models.forEach((model) => {
        entities.push({ name: model.toUpperCase(), type: 'device' });
    });

    // Protocols
    const protocols = lowerText.match(/\b(rs-?485|modbus|profibus|ethernet|can|devicenet)\b/g) || [];
    protocols.forEach((proto) => {
        entities.push({ name: proto.toUpperCase(), type: 'protocol' });
    });

    // Components
    const components = lowerText.match(
        /\b(power|supply|battery|led|display|button|port|antenna|cable|connector)\b/g
    ) || [];
    components.forEach((comp) => {
        entities.push({ name: comp.toUpperCase(), type: 'component' });
    });

    return entities;
}

/**
 * Extract and store entities from a knowledge base entry
 */
export async function processEntryEntities(
    entryId: string,
    content: string
): Promise<void> {
    const entities = extractEntities(content);

    // Add to knowledge graph with source
    for (const entity of entities) {
        await addEntities([entity]);
    }
}

/**
 * Get graph-boosted scores for retrieval
 */
export async function getGraphBoostedIds(
    queryEntities: string[],
    daysSince: number = 30,
    boostWeight: number = 0.15
): Promise<Map<string, number>> {
    const supabase = getSupabase();

    // Get recent feedback
    const { data: feedback } = await supabase
        .from('retrieval_feedback')
        .select('result_id, rating')
        .gte(
            'created_at',
            new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000).toISOString()
        );

    if (!feedback) return new Map();

    // Calculate boost scores
    const boostMap = new Map<string, number>();
    feedback.forEach((f) => {
        const score = (f.rating || 3) / 5; // Normalize to 0-1
        const existing = boostMap.get(f.result_id) || 0;
        boostMap.set(f.result_id, Math.max(existing, score * boostWeight));
    });

    return boostMap;
}

/**
 * Submit feedback for a retrieval result
 */
export async function submitFeedback(
    queryText: string,
    resultId: string,
    rating: number,
    isRelevant: boolean,
    feedbackText?: string
): Promise<void> {
    const supabase = getSupabase();

    const { error } = await supabase.from('retrieval_feedback').insert({
        query_text: queryText,
        result_id: resultId,
        rating,
        is_relevant: isRelevant,
        feedback_text: feedbackText,
    });

    if (error) {
        console.warn('⚠️  Failed to submit feedback:', error);
    }
}

// Singleton for graph queries
let _entityCache: Map<string, Relationship[]> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Get cached related entities or fetch fresh
 */
export async function getCachedRelatedEntities(
    entity: string,
    maxResults: number = 10
): Promise<Relationship[]> {
    const cacheKey = entity.toLowerCase();
    const cached = _entityCache.get(cacheKey);
    const timestamp = cacheTimestamps.get(cacheKey);

    if (cached && timestamp && Date.now() - timestamp < CACHE_TTL) {
        return cached;
    }

    const results = await findRelatedEntities(entity, maxResults);
    _entityCache.set(cacheKey, results);
    cacheTimestamps.set(cacheKey, Date.now());

    return results;
}
