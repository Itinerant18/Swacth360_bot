/**
 * src/app/api/admin/seed-diagram/route.ts
 *
 * Saves a bot-generated diagram to hms_knowledge so it can be
 * retrieved directly next time instead of generating it fresh.
 *
 * Called by the "Save to KB" button in DiagramCard.tsx.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { requireAdmin } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response!;

    const supabase = getSupabase();

    try {
        const {
            markdown,
            title,
            diagramType,
            panelType,
            sourceName,
        } = await req.json();

        // Validate required fields
        if (!markdown?.trim() || markdown.trim().length < 50) {
            return NextResponse.json(
                { error: 'markdown is required and must be at least 50 characters' },
                { status: 400 }
            );
        }
        if (!diagramType?.trim()) {
            return NextResponse.json({ error: 'diagramType is required' }, { status: 400 });
        }

        const cleanTitle = (title || `${diagramType} diagram for ${panelType || 'HMS Panel'}`).trim();
        const cleanSource = (sourceName || panelType || 'Admin Saved').trim();

        console.info('[admin.seed_diagram] request', {
            diagramType,
            panelType,
            markdownLength: markdown.length,
        });

        // Extract technical entities from diagram for better retrieval
        const terminals = [...markdown.matchAll(/`(TB\d+[+-]?|A[+-]|B[+-]|GND|PE)`/g)].map((m: RegExpMatchArray) => m[1]);
        const protocols = [...markdown.matchAll(/`?(RS-?485|Modbus|PROFIBUS|Ethernet)`?/gi)].map((m: RegExpMatchArray) => m[1]);
        const voltages = [...markdown.matchAll(/`(\d+V\s*DC|\d+V\s*AC)`/g)].map((m: RegExpMatchArray) => m[1]);
        const entities = [...new Set([...terminals, ...protocols, ...voltages])].slice(0, 10);

        // Build rich embedding text for retrieval
        const embeddingText = [
            `Source: ${cleanSource}`,
            `Diagram Type: ${diagramType}`,
            `Category: Installation & Commissioning`,
            `Content Type: Technical Diagram — ASCII/Markdown`,
            entities.length > 0 ? `Terminals & Entities: ${entities.join(', ')}` : '',
            `Title: ${cleanTitle}`,
            `Description: ${diagramType} diagram showing connections, terminals, wire colours for ${cleanTitle}`,
            `Full Diagram:\n${markdown.slice(0, 600)}`,
        ].filter(Boolean).join('\n');

        const vector = await embedText(embeddingText);

        const id = `diagram_admin_${Date.now()}_${diagramType}`;

        const { error } = await supabase.from('hms_knowledge').insert({
            id,
            question: `Show ${diagramType} diagram for ${cleanTitle}`,
            answer: markdown,
            category: 'Installation & Commissioning',
            subcategory: diagramType,
            product: 'HMS Panel',
            tags: [diagramType, 'diagram', 'wiring', panelType?.toLowerCase(), ...entities.map((e: string) => e.toLowerCase())].filter(Boolean),
            content: embeddingText,
            embedding: vector,
            source: 'admin',
            source_name: cleanSource,
            chunk_type: 'diagram',
            diagram_source: 'admin',
            entities,
        });

        if (error) throw error;

        console.info('[admin.seed_diagram] success', { id, diagramType });

        return NextResponse.json({
            success: true,
            id,
            message: `Diagram saved to knowledge base. Next time this question is asked, this diagram will be served directly.`,
        });

    } catch (err: unknown) {
        console.error('[admin.seed_diagram] error', err);
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 }
        );
    }
}
