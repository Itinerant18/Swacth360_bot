import assert from 'node:assert/strict';
import Module from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';

type IngestPost = typeof import('@/app/api/admin/ingest/route').POST;
type RaptorGet = typeof import('@/app/api/admin/raptor/route').GET;
type RaptorPost = typeof import('@/app/api/admin/raptor/route').POST;
type QuestionsPatch = typeof import('@/app/api/admin/questions/route').PATCH;
type AdminDashboardComponent = typeof import('@/app/admin/page').default;
type GraphTabComponent = typeof import('@/components/GraphTab').default;
type FeedbackTabComponent = typeof import('@/components/FeedbackTab').default;

type SmokeModules = {
    ingestPost: IngestPost;
    raptorGet: RaptorGet;
    raptorPost: RaptorPost;
    questionsPatch: QuestionsPatch;
    AdminDashboard: AdminDashboardComponent;
    GraphTab: GraphTabComponent;
    FeedbackTab: FeedbackTabComponent;
};

type ModuleWithLoad = typeof Module & {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

const moduleLoader = Module as ModuleWithLoad;
const originalLoad = moduleLoader._load.bind(moduleLoader);

moduleLoader._load = (request, parent, isMain) => {
    if (request === 'server-only') {
        return {};
    }

    return originalLoad(request, parent, isMain);
};

async function loadSmokeModules(): Promise<SmokeModules> {
    const [
        ingestModule,
        raptorModule,
        questionsModule,
        adminPageModule,
        graphTabModule,
        feedbackTabModule,
    ] = await Promise.all([
        import('@/app/api/admin/ingest/route'),
        import('@/app/api/admin/raptor/route'),
        import('@/app/api/admin/questions/route'),
        import('@/app/admin/page'),
        import('@/components/GraphTab'),
        import('@/components/FeedbackTab'),
    ]);

    return {
        ingestPost: ingestModule.POST,
        raptorGet: raptorModule.GET,
        raptorPost: raptorModule.POST,
        questionsPatch: questionsModule.PATCH,
        AdminDashboard: adminPageModule.default,
        GraphTab: graphTabModule.default,
        FeedbackTab: feedbackTabModule.default,
    };
}

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

async function main() {
    const {
        ingestPost,
        raptorGet,
        raptorPost,
        questionsPatch,
        AdminDashboard,
        GraphTab,
        FeedbackTab,
    } = await loadSmokeModules();

    await run('admin ingest requires authentication before env validation', async () => {
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

                assert.equal(response.status, 401);
                assert.match(String(body.error), /^Authentication (required|failed)$/);
            }
        );
    });

    await run('admin raptor GET requires authentication', async () => {
        const response = await raptorGet();
        const body = await response.json();

        assert.equal(response.status, 401);
        assert.match(String(body.error), /^Authentication (required|failed)$/);
    });

    await run('admin raptor POST requires authentication', async () => {
        const request = new NextRequest('http://localhost/api/admin/raptor', {
            method: 'POST',
        });

        const response = await raptorPost(request);
        const body = await response.json();

        assert.equal(response.status, 401);
        assert.match(String(body.error), /^Authentication (required|failed)$/);
    });

    await run('admin questions PATCH requires authentication before validation', async () => {
        const request = new NextRequest('http://localhost/api/admin/questions', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
        });

        const response = await questionsPatch(request);
        const body = await response.json();

        assert.equal(response.status, 401);
        assert.match(String(body.error), /^Authentication (required|failed)$/);
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
        assert.match(html, /entities/);
        assert.match(html, /error codes \(E001\)/);
    });

    await run('feedback tab renders its primary heading', () => {
        const html = renderToStaticMarkup(React.createElement(FeedbackTab));

        assert.match(html, /Retrieval Feedback/);
        assert.match(html, /Recent Feedback/);
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
