// Small, dependency-free checks shared by the rules.

export type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

/** The pattern the official schema uses for https_url, plus a parse check. */
export function isHttpsUrl(value: unknown): value is string {
    if (typeof value !== "string" || !/^https:\/\/[^\s/?#]+/.test(value)) return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.hostname.length > 0;
    } catch {
        return false;
    }
}

/** A host with an optional port, as organization.domain allows (official schema $defs/domain). */
const DOMAIN =
    /^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[1-9][0-9]{0,4})?$/;

export function isDomain(value: unknown): value is string {
    return typeof value === "string" && DOMAIN.test(value);
}

export const VERSION_PATTERN = /^[0-9]+\.[0-9]+$/;

/** The major version of a major.minor string, or undefined if it isn't one. */
export function majorOf(value: unknown): number | undefined {
    return typeof value === "string" && VERSION_PATTERN.test(value) ? Number(value.split(".")[0]) : undefined;
}

/** Scope tokens, RFC 6749 §3.3. */
export const SCOPE_TOKEN = /^[\x21\x23-\x5B\x5D-\x7E]+$/;

/** Host of a URL with its port when not the default, lowercased. */
export function hostOf(url: string): string | undefined {
    try {
        return new URL(url).host.toLowerCase();
    } catch {
        return undefined;
    }
}

/** Describes a value's type for error messages: "a number", "an array", "null". */
export function describe(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "an array";
    if (typeof value === "string") return value.length === 0 ? "an empty string" : "a string";
    if (typeof value === "object") return "an object";
    return `a ${typeof value}`;
}

/** Shortens a value for display in a message. */
export function show(value: unknown): string {
    const text = typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value) ?? String(value);
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/** Collects problems for one rule. */
export class Problems {
    readonly list: { path: string; message: string; fix: string }[] = [];

    add(path: string, message: string, fix: string): void {
        this.list.push({ path, message, fix });
    }

    /** Adds a problem unless value is an HTTPS URL. Returns whether it was one. */
    https(path: string, value: unknown, what: string): value is string {
        if (isHttpsUrl(value)) return true;
        if (typeof value === "string" && /^http:\/\//i.test(value)) {
            this.add(path, `${what} uses http://, and every URL in poppy.json must be HTTPS`, `Change it to ${show(value.replace(/^http:/i, "https:"))}.`);
        } else {
            this.add(path, `${what} must be an absolute HTTPS URL, got ${describe(value)}${typeof value === "string" ? ` ${show(value)}` : ""}`, `Set ${path} to a full https:// URL.`);
        }
        return false;
    }

    /** Adds a problem unless value is a non-empty string. Returns whether it was one. */
    text(path: string, value: unknown, what: string, fix: string): boolean {
        if (isNonEmptyString(value)) return true;
        this.add(path, value === undefined ? `${what} is missing` : `${what} must be a non-empty string, got ${describe(value)}`, fix);
        return false;
    }

    /** Adds a problem unless value is absent or a boolean. */
    optionalBoolean(path: string, value: unknown): void {
        if (value === undefined || typeof value === "boolean") return;
        this.add(path, `must be true or false, got ${describe(value)} ${show(value)}`, `Set ${path} to true or false (without quotes), or remove it.`);
    }

    get outcome(): { status: "pass" } | { status: "fail"; problems: { path: string; message: string; fix: string }[] } {
        return this.list.length === 0 ? { status: "pass" } : { status: "fail", problems: this.list };
    }
}
