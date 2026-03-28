export function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const { headers, ...rest } = init;
    const mergedHeaders = headers ? new Headers(headers) : undefined;

    return fetch(input, {
        credentials: 'include',
        ...rest,
        headers: mergedHeaders,
    });
}
