export function sanitizeInput(text: string): string {
    if (!text) {
        return '';
    }

    return text
        .replace(/ignore (all )?previous instructions/gi, '[filtered]')
        .replace(/system prompt/gi, '[filtered]')
        .replace(/you are chatgpt/gi, '[filtered]')
        .replace(/act as/gi, '[filtered]');
}
