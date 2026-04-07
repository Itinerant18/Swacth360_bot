/**
 * src/lib/pdf-extract.ts
 *
 * PDF text extraction utility compatible with Next.js API routes.
 *
 * WHY NOT pdf-parse?
 *   pdf-parse internally loads pdf.js which uses a dynamic worker:
 *   require('pdfjs-dist/build/pdf.worker.js')
 *   Next.js webpack cannot resolve this dynamic expression → "too dynamic" error.
 *
 * SOLUTION: Use pdf2json — pure Node.js, no worker, no dynamic require.
 *   Falls back to raw buffer parsing if pdf2json also fails.
 */

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
    const buf = Buffer.from(buffer);

    // ── Strategy 1: pdf2json (most reliable in Next.js) ──────────
    try {
        const PDFParser = (await import('pdf2json')).default;

        return await new Promise<string>((resolve, reject) => {
            // @ts-expect-error: pdf2json types expect boolean | undefined but 1 is accepted for raw text mode
            const parser = new PDFParser(null, 1); // 1 = raw text mode

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            parser.on('pdfParser_dataReady', (data: { Pages?: any[] }) => {
                try {
                    // pdf2json stores text in Pages[].Texts[].R[].T (URI encoded)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const pages: string[] = (data?.Pages ?? []).map((page: { Texts?: any[] }) => {
                        const words: string[] = (page?.Texts ?? []).map((t: { R?: { T: string }[] }) => {
                            try {
                                return decodeURIComponent(t?.R?.[0]?.T ?? '');
                            } catch {
                                return t?.R?.[0]?.T ?? '';
                            }
                        });
                        return words.join(' ');
                    });

                    const text = pages.join('\n').trim();
                    if (text.length < 20) {
                        reject(new Error('pdf2json extracted no usable text'));
                    } else {
                        resolve(text);
                    }
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    reject(new Error(`pdf2json parse error: ${message}`));
                }
            });

            parser.on('pdfParser_dataError', (err: Error | { parserError: Error }) => {
                const message = err instanceof Error ? err.message : (err?.parserError?.message ?? JSON.stringify(err));
                reject(new Error(`pdf2json error: ${message}`));
            });

            parser.parseBuffer(buf);
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Warning: pdf2json failed: ${message} - trying fallback`);
    }

    // ── Strategy 2: pdfjs-dist (no worker mode) ──────────────────
    try {
        // Dynamically import to avoid webpack static analysis
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as any).catch(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            () => import('pdfjs-dist' as any)
        );

        // Disable worker entirely - run in main thread
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';

        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(buf),
            useWorkerFetch: false,
            isEvalSupported: false,
            useSystemFonts: true,
            disableFontFace: true,
        });

        const pdf = await loadingTask.promise;
        const pages: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const text = content.items
                .map((item: { str?: string }) => item.str ?? '')
                .join(' ');
            pages.push(text);
        }

        const result = pages.join('\n').trim();
        if (result.length > 20) return result;
        throw new Error('pdfjs extracted no usable text');

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Warning: pdfjs-dist failed: ${message} - trying raw fallback`);
    }

    // ── Strategy 3: Raw text scrape (last resort) ─────────────────
    // Extracts readable ASCII strings from raw PDF bytes.
    // Catches simple text-layer PDFs that the above miss.
    try {
        const raw = buf.toString('latin1');

        // Extract text between BT (Begin Text) and ET (End Text) markers
        const btEtMatches = [...raw.matchAll(/BT([\s\S]*?)ET/g)].map(m => m[1]);
        const extracted: string[] = [];

        for (const block of btEtMatches) {
            // Match strings in parentheses: (Hello World)
            const parenStrings = [...block.matchAll(/\(([^)]{1,200})\)/g)].map(m => m[1]);
            // Match hex strings: <48656c6c6f>
            const hexStrings = [...block.matchAll(/<([0-9a-fA-F]+)>/g)].map(m => {
                const hex = m[1];
                try {
                    return Buffer.from(hex, 'hex').toString('utf8').replace(/[^\x20-\x7E]/g, '');
                } catch {
                    return '';
                }
            });
            extracted.push(...parenStrings, ...hexStrings);
        }

        // Also grab any long readable ASCII runs outside BT/ET (for simple PDFs)
        const asciiRuns = [...raw.matchAll(/[\x20-\x7E]{8,}/g)]
            .map(m => m[0])
            .filter(s => /[a-zA-Z]{3,}/.test(s)); // must contain actual words

        const combined = [...extracted, ...asciiRuns]
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (combined.length > 50) {
            console.warn('Warning: Using raw text fallback - quality may be lower');
            return combined;
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Warning: Raw fallback failed: ${message}`);
    }

    throw new Error(
        'PDF text extraction failed with all methods. ' +
        'The PDF may be image-only (scanned). ' +
        'The Gemini vision pipeline will still process its images.'
    );
}
