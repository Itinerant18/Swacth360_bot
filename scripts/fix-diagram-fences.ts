/**
 * scripts/fix-diagram-fences.ts
 *
 * Automated fixer for all diagram markdown files in data/diagrams/.
 * 
 * Problems fixed:
 *   1. Mermaid code inside plain ``` fences → converted to ```mermaid fences
 *   2. Mermaid code with NO fences at all → wrapped in ```mermaid fences
 *   3. Split/fragmented code blocks that are part of the same diagram → merged
 *   4. HTML entities (&lt; &gt; &amp; &lt;br/&gt;) → decoded to real characters
 *   5. Escaped markdown brackets (\[ \]) → unescaped
 *
 * Usage:
 *   npx tsx scripts/fix-diagram-fences.ts                    # fix all files in-place
 *   npx tsx scripts/fix-diagram-fences.ts --dry-run           # preview changes only
 *   npx tsx scripts/fix-diagram-fences.ts --file="path.md"    # fix single file
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── CLI args ─────────────────────────────────────────────────
function parseArgs() {
    const args: Record<string, string> = {};
    const flags = new Set<string>();
    for (const a of process.argv.slice(2)) {
        const kv = a.match(/^--([\w][\w-]*)=(.+)$/);
        if (kv) args[kv[1]] = kv[2];
        else if (a.startsWith('--')) flags.add(a.slice(2));
    }
    return { args, flags };
}

// ─── Mermaid diagram type starters ────────────────────────────
const MERMAID_STARTERS = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitgraph|mindmap|timeline|quadrantChart|sankey|xychart|block-beta)\b/;

// Mermaid continuation patterns (lines that are part of a mermaid diagram but don't start with a keyword)
const MERMAID_CONTINUATION = /^\s*(subgraph|end\b|-->|--\>|-.->|-\.\->|==>|--\||style\s|classDef\s|class\s|click\s|linkStyle\s|[A-Z_a-z][\w]*\s*[\[("\{]|[A-Z_a-z][\w]*\s*-->|[A-Z_a-z][\w]*\s*---|\s+[A-Z_a-z])/;

// ─── Decode HTML entities ─────────────────────────────────────
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

// ─── Unescape markdown brackets ───────────────────────────────
function unescapeBrackets(text: string): string {
    return text
        .replace(/\\\[/g, '[')
        .replace(/\\\]/g, ']');
}

// ─── Check if a line looks like mermaid syntax ────────────────
function isMermaidLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false; // blank lines are ambiguous
    
    // Definite mermaid starters
    if (MERMAID_STARTERS.test(trimmed)) return true;
    
    // Mermaid syntax elements
    if (MERMAID_CONTINUATION.test(trimmed)) return true;
    
    // Edge definitions: A --> B, A -->|label| B, etc.
    if (/^[A-Za-z_][\w]*\s*(-->|--\>|-.->|-\.\->|==>|---)/.test(trimmed)) return true;
    
    // Node definitions: A["label"], B("label"), C{"label"}
    if (/^[A-Za-z_][\w]*\s*[\[("{\|]/.test(trimmed)) return true;
    
    // Style/class definitions
    if (/^\s*(style|classDef|class|linkStyle)\s/.test(trimmed)) return true;
    
    // Subgraph/end
    if (/^\s*(subgraph|end)\b/.test(trimmed)) return true;
    
    return false;
}

interface CodeBlock {
    startIndex: number;
    endIndex: number;
    language: string;
    content: string;
    isMermaid: boolean;
}

// ─── Extract code blocks from markdown ────────────────────────
function extractCodeBlocks(text: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const regex = /^(```)([\w-]*)\s*\n([\s\S]*?)^```\s*$/gm;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
        const language = match[2] || '';
        const content = match[3];
        const isMermaid = language === 'mermaid' || 
            (!language && MERMAID_STARTERS.test(content.trim()));
        
        blocks.push({
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            language,
            content,
            isMermaid,
        });
    }
    
    return blocks;
}

// ─── Check if consecutive code blocks should be merged ────────
function shouldMergeBlocks(block1: CodeBlock, block2: CodeBlock, fullText: string): boolean {
    // Only merge mermaid blocks
    if (!block1.isMermaid && !block2.isMermaid) return false;
    
    // Check the text between the two blocks
    const between = fullText.slice(block1.endIndex, block2.startIndex).trim();
    
    // If there's no meaningful text between them, they should be merged
    if (!between) return true;
    
    // If the between text is just whitespace or blank lines
    if (/^\s*$/.test(between)) return true;
    
    // The second block's content continues the mermaid diagram
    const content2 = block2.content.trim();
    if (isMermaidLine(content2.split('\n')[0])) {
        // Check if block2 starts with continuation syntax (not a new diagram)
        if (!MERMAID_STARTERS.test(content2)) {
            return true;
        }
    }
    
    return false;
}

// ─── Fix a single markdown file ───────────────────────────────
function fixDiagramFile(content: string): { fixed: string; changes: string[] } {
    const changes: string[] = [];
    let result = content;
    
    // Step 1: Decode HTML entities throughout
    const decoded = decodeHtmlEntities(result);
    if (decoded !== result) {
        changes.push('Decoded HTML entities');
        result = decoded;
    }
    
    // Step 2: Unescape brackets
    const unescaped = unescapeBrackets(result);
    if (unescaped !== result) {
        changes.push('Unescaped markdown brackets');
        result = unescaped;
    }
    
    // Step 3: Extract and analyze code blocks
    let blocks = extractCodeBlocks(result);
    
    // Step 4: Check if the file has NO code blocks but contains mermaid content
    if (blocks.length === 0) {
        const lines = result.split('\n');
        let mermaidStart = -1;
        let mermaidEnd = -1;
        let inMermaid = false;
        
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            
            if (!inMermaid && MERMAID_STARTERS.test(trimmed)) {
                mermaidStart = i;
                inMermaid = true;
            } else if (inMermaid) {
                // Check if this line is still part of mermaid
                if (isMermaidLine(trimmed) || trimmed === '') {
                    mermaidEnd = i;
                } else {
                    // Non-mermaid non-blank line — mermaid section ended
                    break;
                }
            }
        }
        
        if (mermaidStart >= 0 && mermaidEnd >= mermaidStart) {
            // Find the actual end (trim trailing blank lines within the mermaid section)
            while (mermaidEnd > mermaidStart && lines[mermaidEnd].trim() === '') {
                mermaidEnd--;
            }
            
            const mermaidContent = lines.slice(mermaidStart, mermaidEnd + 1).join('\n');
            const before = lines.slice(0, mermaidStart).join('\n');
            const after = lines.slice(mermaidEnd + 1).join('\n');
            
            result = `${before}\n\`\`\`mermaid\n${mermaidContent}\n\`\`\`\n${after}`;
            changes.push('Wrapped unfenced mermaid code in ```mermaid fence');
            
            // Re-extract blocks after modification
            blocks = extractCodeBlocks(result);
        }
    }
    
    // Step 5: Fix existing code blocks — add 'mermaid' language tag where missing
    if (blocks.length > 0) {
        // Work backwards to preserve indices
        const processedBlocks = [...blocks].reverse();
        
        for (const block of processedBlocks) {
            if (block.isMermaid && block.language !== 'mermaid') {
                // Replace the opening fence from ``` to ```mermaid
                const oldFence = `\`\`\`${block.language}`;
                const before = result.slice(0, block.startIndex);
                const after = result.slice(block.startIndex + oldFence.length);
                result = before + '```mermaid' + after;
                changes.push(`Changed \`\`\`${block.language || '(plain)'} to \`\`\`mermaid`);
            }
        }
        
        // Re-extract after fixing language tags
        blocks = extractCodeBlocks(result);
    }
    
    // Step 6: Merge consecutive mermaid blocks that should be one diagram
    if (blocks.length > 1) {
        const mermaidBlocks = blocks.filter(b => b.isMermaid);
        
        if (mermaidBlocks.length > 1) {
            // Check if they should be merged (consecutive mermaid blocks)
            const mergeGroups: CodeBlock[][] = [[mermaidBlocks[0]]];
            
            for (let i = 1; i < mermaidBlocks.length; i++) {
                const prev = mermaidBlocks[i - 1];
                const curr = mermaidBlocks[i];
                
                if (shouldMergeBlocks(prev, curr, result)) {
                    mergeGroups[mergeGroups.length - 1].push(curr);
                } else {
                    mergeGroups.push([curr]);
                }
            }
            
            // Apply merges (work backwards to preserve indices)
            for (const group of [...mergeGroups].reverse()) {
                if (group.length < 2) continue;
                
                const mergedContent = group.map(b => b.content.trim()).join('\n');
                const firstBlock = group[0];
                const lastBlock = group[group.length - 1];
                
                const before = result.slice(0, firstBlock.startIndex);
                const after = result.slice(lastBlock.endIndex);
                
                result = `${before}\`\`\`mermaid\n${mergedContent}\n\`\`\`${after}`;
                changes.push(`Merged ${group.length} fragmented code blocks into one mermaid block`);
            }
        }
    }
    
    // Step 7: Final cleanup — remove "Mermaid Code:" or "Here's the Mermaid code:" headers
    // that are now redundant since we have proper fences
    result = result.replace(/^(#{1,3}\s+)?\*{0,2}_?Mermaid\s+[Cc]ode:?\s*_?\*{0,2}\s*$/gm, '');
    result = result.replace(/^Here'?s?\s+the\s+Mermaid\s+code:?\s*$/gim, '');
    
    // Clean up excessive blank lines (3+ → 2)
    result = result.replace(/\n{4,}/g, '\n\n\n');
    
    return { fixed: result, changes };
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
    const { args, flags } = parseArgs();
    const dryRun = flags.has('dry-run');
    const dir = args.dir || 'data/diagrams';
    
    let files: string[];
    
    if (args.file) {
        if (!fs.existsSync(args.file)) {
            console.error(`File not found: ${args.file}`);
            process.exit(1);
        }
        files = [args.file];
    } else {
        if (!fs.existsSync(dir)) {
            console.error(`Directory not found: ${dir}`);
            process.exit(1);
        }
        files = fs.readdirSync(dir)
            .filter(f => f.toLowerCase().endsWith('.md'))
            .map(f => path.join(dir, f));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('Diagram Markdown Fixer');
    console.log('='.repeat(60));
    console.log(`Files:     ${files.length}`);
    console.log(`Dry Run:   ${dryRun ? 'YES (no writes)' : 'NO (live)'}`);
    console.log('');
    
    let fixedCount = 0;
    let unchangedCount = 0;
    let errorCount = 0;
    const allChanges: Array<{ file: string; changes: string[] }> = [];
    
    for (const filePath of files) {
        try {
            const original = fs.readFileSync(filePath, 'utf-8');
            const { fixed, changes } = fixDiagramFile(original);
            
            if (changes.length > 0) {
                const baseName = path.basename(filePath);
                console.log(`  ✏️  ${baseName}`);
                for (const change of changes) {
                    console.log(`      → ${change}`);
                }
                
                if (!dryRun) {
                    fs.writeFileSync(filePath, fixed, 'utf-8');
                }
                
                fixedCount++;
                allChanges.push({ file: path.basename(filePath), changes });
            } else {
                unchangedCount++;
            }
        } catch (err) {
            console.error(`  ❌ ${path.basename(filePath)}: ${(err as Error).message}`);
            errorCount++;
        }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Done: ${fixedCount} fixed | ${unchangedCount} unchanged | ${errorCount} errors`);
    if (dryRun) {
        console.log('(Dry run — no files were modified)');
    }
    console.log('='.repeat(60) + '\n');
    
    if (allChanges.length > 0) {
        console.log('Summary of changes:');
        for (const { file, changes } of allChanges) {
            console.log(`  ${file}: ${changes.join(', ')}`);
        }
        console.log('');
    }
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
