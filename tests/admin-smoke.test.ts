import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';

import { POST as ingestPost } from '@/app/api/admin/ingest/route';
import { GET as raptorGet, POST as raptorPost } from '@/app/api/admin/raptor/route';
import { PATCH as questionsPatch } from '@/app/api/admin/questions/route';
import AdminDashboard from '@/app/admin/page';
import GraphTab from '@/components/GraphTab';
import FeedbackTab from '@/components/FeedbackTab';

async function withEnv(overrides: Record<string, string | undefined>, fn: () => Promise<void> | void) {
    const previous = new Map<string, string | undefined>();

    for (const [key, value] of Object.entries(overrides)) {
        previous.set(key, process.env[key]);
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    const restore = () => {
        for (const [key, value] of previous.entries()) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    };

    try {
        await fn();
    } catch (error) {
        restore();
        throw error;
    }
    restore();
}

async function run(name: string, fn: () => Promise<void> | void) {
    await fn();
    console.log(`PASS ${name}`);
}

await run('admin ingest returns 500 when required API keys are missing', async () => {
    await withEnv(
        {
            SARVAM_API_KEY: undefined,
            OPENAI_API_KEY: undefined,
            GEMINI_API_KEY: undefined,
        },
        async () => {
            const request = new NextRequest('http://localhost/api/admin/ingest', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    text: 'A'.repeat(80),
                    sourceName: 'Smoke Test',
                }),
            });

            const response = await ingestPost(request);
            const body = await response.json();

            assert.equal(response.status, 500);
            assert.equal(body.error, 'SARVAM_API_KEY not configured');
        }
    );
});

await run('admin raptor GET rejects unauthorized requests', async () => {
    const request = new NextRequest('http://localhost/api/admin/raptor', {
        method: 'GET',
    });

    const response = await raptorGet(request);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, 'Unauthorized');
});

await run('admin raptor POST rejects unauthorized requests', async () => {
    const request = new NextRequest('http://localhost/api/admin/raptor', {
        method: 'POST',
    });

    const response = await raptorPost(request);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, 'Unauthorized');
});

await run('admin questions PATCH validates missing id/status before hitting storage', async () => {
    const request = new NextRequest('http://localhost/api/admin/questions', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });

    const response = await questionsPatch(request);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'id and status required');
});

await run('admin dashboard renders core headings', () => {
    const html = renderToStaticMarkup(React.createElement(AdminDashboard));

    assert.match(html, /Admin/);
    assert.match(html, /Dashboard/);
    assert.match(html, /Review/);
});

await run('graph tab renders its primary heading', () => {
    const html = renderToStaticMarkup(React.createElement(GraphTab));

    assert.match(html, /Knowledge Graph/);
    assert.match(html, /Search/);
});

await run('feedback tab renders its primary heading', () => {
    const html = renderToStaticMarkup(React.createElement(FeedbackTab));

    assert.match(html, /Retrieval Feedback/);
    assert.match(html, /Recent Feedback/);
});
