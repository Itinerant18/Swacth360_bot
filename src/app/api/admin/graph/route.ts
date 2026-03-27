/**
 * src/app/api/admin/graph/route.ts
 * 
 * API endpoint for knowledge graph management
 * Allows adding entities and relationships
 */

import { NextRequest, NextResponse } from 'next/server';
import { addEntities, findRelatedEntities, findPath, extractEntities } from '@/lib/knowledge-graph';
import { getSupabase } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';

// Types for the API
interface Entity {
    name: string;
    type: string;
}

interface Relationship {
    entityA: string;
    entityB: string;
    relationship: string;
    confidence: number;
}

// Helper function to infer entity type from name
function inferEntityType(name: string): string {
    const lower = name.toLowerCase();

    // Error codes
    if (/^e\d{3,4}$/i.test(lower) || lower.includes('error') || lower.includes('fault')) {
        return 'error';
    }

    // Terminals
    if (/^tb\d+[+-]?$/i.test(lower) || lower.includes('terminal') || lower.includes('tb')) {
        return 'terminal';
    }

    // Protocols
    if (['rs485', 'rs232', 'modbus', 'profibus', 'ethernet', 'can', 'devicenet'].some(p => lower.includes(p))) {
        return 'protocol';
    }

    // Devices
    if (lower.includes('hms') || lower.includes('gateway') || lower.includes('panel') || lower.includes('controller')) {
        return 'device';
    }

    // Components
    if (['power', 'battery', 'led', 'display', 'antenna', 'cable'].some(c => lower.includes(c))) {
        return 'component';
    }

    return 'device';
}

export async function POST(request: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response!;

    try {
        const body = await request.json();
        const { action, data } = body;
        console.info('[admin.graph.post] request', { action });

        switch (action) {
            case 'add_entities': {
                if (!data || !Array.isArray(data)) {
                    return NextResponse.json(
                        { error: 'Invalid data: expected array of entities' },
                        { status: 400 }
                    );
                }

                await addEntities(data);

                return NextResponse.json({
                    success: true,
                    message: `Added ${data.length} entities to knowledge graph`
                });
            }

            case 'extract_and_add': {
                if (!data || !data.content || !data.entryId) {
                    return NextResponse.json(
                        { error: 'Invalid data: expected content and entryId' },
                        { status: 400 }
                    );
                }

                const entities = extractEntities(data.content);

                // Add source ID to entities
                const entitiesWithSource = entities.map(e => ({
                    ...e,
                    sourceId: data.entryId
                }));

                await addEntities(entitiesWithSource);

                return NextResponse.json({
                    success: true,
                    message: `Extracted and added ${entities.length} entities`,
                    entities
                });
            }

            case 'find_related': {
                if (!data || !data.entity) {
                    return NextResponse.json(
                        { error: 'Invalid data: expected entity name' },
                        { status: 400 }
                    );
                }

                const related = await findRelatedEntities(data.entity, data.maxResults || 10);

                return NextResponse.json({
                    success: true,
                    entity: data.entity,
                    related: related.map((item) => ({
                        entity_b: item.entityB,
                        relationship: item.relationship,
                        confidence: item.confidence,
                    })),
                });
            }

            case 'find_path': {
                if (!data || !data.startEntity || !data.endEntity) {
                    return NextResponse.json(
                        { error: 'Invalid data: expected startEntity and endEntity' },
                        { status: 400 }
                    );
                }

                const path = await findPath(data.startEntity, data.endEntity, data.maxHops || 3);

                return NextResponse.json({
                    success: true,
                    path: path?.path || null,
                    confidence: path?.confidence || 0
                });
            }

            case 'get_all': {
                const supabase = getSupabase();
                // Get all entities and relationships
                const { data: relations } = await supabase
                    .from('knowledge_graph')
                    .select('entity_a, entity_b, relationship, confidence');

                const entitySet = new Set<string>();
                const rels: Relationship[] = [];

                if (relations) {
                    relations.forEach((r: { entity_a: string; entity_b: string; relationship: string; confidence: number }) => {
                        entitySet.add(r.entity_a);
                        entitySet.add(r.entity_b);
                        rels.push({
                            entityA: r.entity_a,
                            entityB: r.entity_b,
                            relationship: r.relationship,
                            confidence: r.confidence
                        });
                    });
                }

                // Infer entity types from names
                const ents: Entity[] = Array.from(entitySet).map(name => ({
                    name,
                    type: inferEntityType(name)
                }));

                return NextResponse.json({
                    success: true,
                    entities: ents,
                    relationships: rels
                });
            }

            case 'add_relationship': {
                const supabase = getSupabase();
                if (!data || !data.entityA || !data.entityB) {
                    return NextResponse.json(
                        { error: 'Invalid data: expected entityA and entityB' },
                        { status: 400 }
                    );
                }

                const { error } = await supabase.from('knowledge_graph').insert({
                    entity_a: data.entityA,
                    entity_b: data.entityB,
                    relationship: data.relationship || 'related_to',
                    confidence: 0.8
                });

                if (error) {
                    return NextResponse.json({ error: error.message }, { status: 500 });
                }

                return NextResponse.json({
                    success: true,
                    message: 'Relationship added'
                });
            }

            case 'extract_sample': {
                // Return sample entities for demonstration
                const sampleEntities = [
                    { name: 'E001', type: 'error' as const },
                    { name: 'E015', type: 'error' as const },
                    { name: 'TB1+', type: 'terminal' as const },
                    { name: 'TB2-', type: 'terminal' as const },
                    { name: 'RS485', type: 'protocol' as const },
                    { name: 'Modbus', type: 'protocol' as const },
                    { name: 'HMS-200', type: 'device' as const },
                    { name: 'X-Gateway', type: 'device' as const },
                ];

                // Add to knowledge graph
                await addEntities(sampleEntities);

                return NextResponse.json({
                    success: true,
                    entities: sampleEntities,
                    message: 'Sample entities extracted and added'
                });
            }

            default:
                return NextResponse.json(
                    { error: 'Unknown action' },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error('[admin.graph.post] error', error);
        return NextResponse.json(
            { error: 'Failed to process knowledge graph request' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response!;

    void request;
    // Get knowledge graph statistics
    const supabase = getSupabase();
    console.info('[admin.graph.get] request');

    const { data: rows, error } = await supabase
        .from('knowledge_graph')
        .select('entity_a, entity_b, relationship');

    if (error) {
        console.error('[admin.graph.get] error', error);
        return NextResponse.json(
            { error: 'Failed to fetch graph stats' },
            { status: 500 }
        );
    }

    const uniqueEntities = new Set<string>();
    const relationshipTypes = new Set<string>();

    (rows || []).forEach((row: { entity_a: string; entity_b: string; relationship: string }) => {
        uniqueEntities.add(row.entity_a);
        uniqueEntities.add(row.entity_b);
        relationshipTypes.add(row.relationship);
    });

    return NextResponse.json({
        total_relationships: rows?.length || 0,
        unique_entities: uniqueEntities.size,
        relationship_types: [...relationshipTypes],
    });
}
