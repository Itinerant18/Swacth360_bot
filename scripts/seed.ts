import { loadEnvConfig } from '@next/env';
import { Pinecone } from '@pinecone-database/pinecone';
import { OllamaEmbeddings } from '@langchain/ollama';
import { Document } from '@langchain/core/documents';
import * as fs from 'fs';
import * as path from 'path';

// Load the local .env variables into the Node.js context natively
const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function seed() {
    console.log('🏁 Starting data ingestion process...');

    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const indexName = process.env.PINECONE_INDEX_NAME;
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    if (!pineconeApiKey || !indexName) {
        throw new Error('❌ Missing Pinecone API Key or Index Name in environment variables');
    }

    // 1. Initialize Pinecone client
    console.log('🌲 Connecting to Pinecone vector database...');
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey,
    });
    const pineconeIndex = pinecone.index(indexName);

    // 2. Read Knowledge Base JSON
    console.log('📂 Reading dataset from data/hms-dexter-qa.json...');
    const dataPath = path.join(process.cwd(), 'data', 'hms-dexter-qa.json');
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const qaData = JSON.parse(rawData);

    // 3. Prepare Langchain Documents with Full Context
    const documents: Document[] = qaData.map((item: any) => {

        // Construct a highly detailed text string for the embedding model to read
        const embeddingText = `[ID: ${item.id}]
    Product: ${item.product}
    Category: ${item.category} > ${item.subcategory}
    Tags: ${item.tags.join(', ')}
    Question: ${item.question}
    Answer: ${item.answer}`.replace(/  +/g, ' '); // Clean up extra spaces

        return new Document({
            pageContent: embeddingText,
            metadata: {
                source: 'hms-dexter-qa.json',
                id: item.id,
                product: item.product,
                category: item.category,
                tags: item.tags,
                question: item.question
            },
        });
    });

    // 4. Initialize Local Embedder using Ollama (`nomic-embed-text`)
    console.log('🦙 Initializing Ollama nomic-embed-text model locally...');
    const embeddings = new OllamaEmbeddings({
        model: 'nomic-embed-text',
        baseUrl: ollamaBaseUrl,
    });

    console.log(`\n⏳ Processing ${documents.length} knowledge chunks...`);

    // 5. Transform Text to Embeddings and Push to Pinecone
    for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        console.log(`\n   🔹 Chunk ${i + 1}/${documents.length}: Generating mathematical embedding...`);

        // Convert English string to mathematical numbers
        const vector = await embeddings.embedQuery(doc.pageContent);

        // Store in Pinecone database
        console.log(`   ⬆️  Uploading Chunk ${i + 1} to Pinecone...`);
        await pineconeIndex.upsert({
            records: [
                {
                    id: doc.metadata.id,     // Use the actual ID from JSON
                    values: vector,  // The numerical representation
                    metadata: {
                        text: doc.pageContent,  // The original text reference
                    },
                }
            ]
        });
    }

    console.log('\n✅ Seeding completed successfully!');
}

seed().catch((error) => {
    console.error('\n❌ Fatal error seeding database:', error);
    process.exit(1);
});
