function normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
}

export function parseAdminEmails(raw: string | null | undefined): string[] {
    if (!raw) {
        return [];
    }

    return raw
        .split(',')
        .map(normalizeEmail)
        .filter(Boolean);
}

export function getConfiguredAdminEmails(raw?: string | null): string[] {
    return parseAdminEmails(
        raw
        ?? process.env.ALLOWED_ADMIN_EMAILS
        ?? process.env.NEXT_PUBLIC_ALLOWED_ADMIN_EMAILS
        ?? '',
    );
}

export function isAdminEmail(email: string | null | undefined, raw?: string | null): boolean {
    if (!email) {
        return false;
    }

    return getConfiguredAdminEmails(raw).includes(normalizeEmail(email));
}
