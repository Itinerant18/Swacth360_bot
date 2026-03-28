import { loadEnvConfig } from '@next/env';
import { Pinecone } from '@pinecone-database/pinecone';
import { Document } from '@langchain/core/documents';
import * as fs from 'fs';
import * as path from 'path';
import {
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    embedTexts,
} from '../src/lib/embeddings';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function seed(): Promise<void> {
    console.log('Starting data ingestion process...');

    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const indexName = process.env.PINECONE_INDEX_NAME;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!pineconeApiKey || !indexName) {
        throw new Error('Missing Pinecone API Key or Index Name in environment variables');
    }

    if (!openaiKey) {
        throw new Error('Missing OPENAI_API_KEY in environment variables');
    }

    console.log('Connecting to Pinecone vector database...');
    const pinecone = new Pinecone({ apiKey: pineconeApiKey });
    const pineconeIndex = pinecone.index(indexName);

    console.log('Reading dataset from data/hms-dexter-qa.json...');
    const dataPath = path.join(process.cwd(), 'data', 'hms-dexter-qa.json');
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const qaData = JSON.parse(rawData);

    const documents: Document[] = qaData.map((item: {
        id: string;
        product: string;
        category: string;
        subcategory: string;
        tags: string[];
        question: string;
        answer: string;
    }) => {
        const embeddingText = `[ID: ${item.id}]
Product: ${item.product}
Category: ${item.category} > ${item.subcategory}
Tags: ${item.tags.join(', ')}
Question: ${item.question}
Answer: ${item.answer}`.replace(/  +/g, ' ');

        return new Document({
            pageContent: embeddingText,
            metadata: {
                source: 'hms-dexter-qa.json',
                id: item.id,
                product: item.product,
                category: item.category,
                tags: item.tags,
                question: item.question,
            },
        });
    });

    console.log(`Embedding model: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dims)`);
    console.log('Ensure your Pinecone index matches the configured EMBEDDING_DIMENSIONS before running this script.');
    console.log(`\nProcessing ${documents.length} knowledge chunks...`);

    for (let index = 0; index < documents.length; index += EMBEDDING_BATCH_SIZE) {
        const batch = documents.slice(index, index + EMBEDDING_BATCH_SIZE);
        const batchNumber = Math.floor(index / EMBEDDING_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(documents.length / EMBEDDING_BATCH_SIZE);

        console.log(`\nBatch ${batchNumber}/${totalBatches}: generating embeddings...`);
        const vectors = await embedTexts(batch.map((doc) => doc.pageContent));

        console.log(`Uploading batch ${batchNumber}/${totalBatches} to Pinecone...`);
        await pineconeIndex.upsert({
            records: batch.map((doc, batchIndex) => ({
                id: String(doc.metadata.id),
                values: vectors[batchIndex],
                metadata: {
                    text: doc.pageContent,
                },
            })),
        });
    }

    console.log('\nSeeding completed successfully.');
}

seed().catch((error) => {
    console.error('\nFatal error seeding database:', error);
    process.exit(1);
});
