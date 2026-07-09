# SAI Data Ingestion — Step-by-Step Commands

## Pre-requisites

Make sure your `.env.local` has:

```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
GOOGLE_API_KEY=...  (needed for seed-pdfs.ts image PDF processing)

```

---

## Step 1: Remove Old (Wrong) Diagram Data from Supabase

The old v1 diagrams have wrong information. Remove them from the `hms_knowledge` table:

```bash
# First, dry-run the v1 folder to see what IDs were created
npx tsx scripts/ingest-diagram.ts --dir="data/SAI-TECH-SUPPORT DEXTER HMS PANNEL RELATED QUESTION" --dry-run

```

Then delete them from Supabase (run in your Supabase SQL editor):

```sql
-- Delete old v1 diagram entries
DELETE FROM hms_knowledge 
WHERE source = 'manual' 
  AND chunk_type = 'diagram'
  AND source_name NOT IN (
    -- Keep only v2 entries (we'll add them next)
    SELECT source_name FROM hms_knowledge WHERE 1=0
  );

```

Or simpler — just delete ALL manual diagrams and re-ingest fresh:

```sql
DELETE FROM hms_knowledge WHERE chunk_type = 'diagram' AND source = 'manual';

```

---

## Step 2: Ingest Correct v2 Diagrams

```bash
# Dry run first to preview what will be ingested (26 .md files)
npx tsx scripts/ingest-diagram.ts --dir="data/SAI-TECH-SUPPORT DEXTER HMS PANNEL RELATED QUESTION v2" --dry-run

# If it looks good, run live:
npx tsx scripts/ingest-diagram.ts --dir="data/SAI-TECH-SUPPORT DEXTER HMS PANNEL RELATED QUESTION v2"

```

This will:

- Auto-detect diagram types from filenames (wiring, sensor, alarm, etc.)
- Generate embeddings via OpenAI text-embedding-3-large
- Upsert into `hms_knowledge` with `chunk_type='diagram'`

---

## Step 3: Batch Ingest ALL 277 PDFs

The `seed-pdfs.ts` script processes ALL PDFs in `data/pdf/` automatically:

```bash
# Dry run first — see the scan without uploading
npx tsx scripts/seed-pdfs.ts --dry-run

# Process in batches to avoid timeouts/rate limits:
# Batch 1: First 50 PDFs
npx tsx scripts/seed-pdfs.ts --limit=50

# Batch 2: PDFs 51-100
npx tsx scripts/seed-pdfs.ts --start=50 --limit=50

# Batch 3: PDFs 101-150
npx tsx scripts/seed-pdfs.ts --start=100 --limit=50

# Batch 4: PDFs 151-200
npx tsx scripts/seed-pdfs.ts --start=150 --limit=50

# Batch 5: PDFs 201-250
npx tsx scripts/seed-pdfs.ts --start=200 --limit=50

# Batch 6: Remaining PDFs (251-277)
npx tsx scripts/seed-pdfs.ts --start=250

```

### Or process all at once (if you have good network):

```bash
npx tsx scripts/seed-pdfs.ts

```

⚠️ **This will take significant time** — each PDF is:

1. Parsed (text extraction or Gemini vision for image PDFs)
2. Chunked into sections
3. Embedded via OpenAI text-embedding-3-large
4. Upserted into Supabase

Estimated time: ~1-3 minutes per PDF × 277 PDFs = **4-14 hours total**

---

## Step 4: Verify Ingestion

```bash
# Audit the knowledge base to see what's now loaded
npx tsx scripts/audit-kb.ts

```

Or check in Supabase SQL editor:

```sql
-- Count total entries
SELECT COUNT(*) FROM hms_knowledge;

-- Count by source
SELECT source, source_name, COUNT(*) as entries 
FROM hms_knowledge 
GROUP BY source, source_name 
ORDER BY entries DESC;

-- Verify v2 diagrams are present
SELECT id, question, category 
FROM hms_knowledge 
WHERE chunk_type = 'diagram' 
ORDER BY id;

```

---

## Summary of Order

| Step | Command | What it does |
| --- | --- | --- |
| 1 | SQL DELETE | Remove wrong v1 diagram data |
| 2 | `ingest-diagram.ts --dir=...v2` | Ingest correct v2 diagrams (26 files) |
| 3 | `seed-pdfs.ts` | Batch ingest all 277 PDFs |
| 4 | `audit-kb.ts` | Verify everything is loaded |

---

## Notes

- `seed-pdfs.ts` uses Gemini 2.0 Flash for image-based PDFs (schematics, diagrams in PDF form)
- Text PDFs use `pdf-parse` → section-aware chunking → embedding
- All embeddings use `text-embedding-3-large` (3072 dimensions)
- The scripts handle duplicates via upsert (safe to re-run)
- If a batch fails midway, use `--start=N` to resume from where it stopped

