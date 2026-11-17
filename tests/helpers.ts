// Shared test helpers: documents to start from, a fake fetcher, and result lookups.

import { check, validateDocument } from "../src/check.js";
import type { Fetcher } from "../src/fetch.js";
import type { Report, RuleResult } from "../src/types.js";

export type Doc = Record<string, any>;

export const DOMAIN = "fernandfinch.example";
export const ORIGIN = `https://${DOMAIN}`;
export const WELL_KNOWN = `${ORIGIN}/.well-known/poppy.json`;
export const PRM_URL = `${ORIGIN}/.well-known/oauth-protected-resource`;
export const ISSUER = `https://auth.${DOMAIN}`;
export const AS_URL = `${ISSUER}/.well-known/oauth-authorization-server`;

/** The smallest valid document. Each call returns a fresh copy to change. */
export function base(): Doc {
    return { protocol_version: "1.0", organization: { name: "Fern & Finch Bakery", domain: DOMAIN }, web: {} };
}

/** base(), changed by fn. */
export function make(fn: (doc: Doc) => void): Doc {
    const doc = base();
    fn(doc);
    return doc;
}

export function goodPrm(): Doc {
    return { resource: ORIGIN, authorization_servers: [ISSUER] };
}

export function goodAs(): Doc {
    return {
        issuer: ISSUER,
        token_endpoint: `${ISSUER}/oauth/token`,
        revocation_endpoint: `${ISSUER}/oauth/revoke`,
        authorization_endpoint: `${ISSUER}/oauth/authorize`,
        grant_types_supported: ["refresh_token", "authorization_code"],
        scopes_supported: ["orders:read"],
        protected_resources: [ORIGIN],
    };
}

export interface Route {
    status?: number;
    /** A value to send as JSON, or a string to send as is. */
    body?: unknown;
    headers?: Record<string, string>;
    /** Throw this instead of responding, like a DNS or TLS failure. */
    error?: Error;
    /** Never respond, so the request times out. */
    hang?: boolean;
}

/** A fetcher that serves the given routes and 404s everything else. Records every request. */
export function fakeFetcher(routes: Record<string, Route>, log: string[] = []): Fetcher {
    return async (url, init) => {
        log.push(url);
        const route = routes[url];
        if (!route) return new Response("not found", { status: 404 });
        if (route.error) throw route.error;
        if (route.hang) {
            return new Promise<Response>((_, reject) => {
                init.signal.addEventListener("abort", () => reject(init.signal.reason));
            });
        }
        const body = route.body === undefined ? null : typeof route.body === "string" ? route.body : JSON.stringify(route.body);
        return new Response(body, { status: route.status ?? 200, headers: { "content-type": "application/json", ...route.headers } });
    };
}

export function redirect(location: string, status = 301): Route {
    return { status, headers: { location } };
}

export function networkError(code = "ENOTFOUND"): Error {
    return Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(`getaddrinfo ${code}`), { code }) });
}

/** Checks a live site whose poppy.json is doc, with extra routes such as OAuth metadata. */
export function live(doc: unknown, routes: Record<string, Route> = {}, options: { skipOAuth?: boolean; timeoutMs?: number } = {}): Promise<Report> {
    return check(DOMAIN, { fetcher: fakeFetcher({ [WELL_KNOWN]: { body: doc }, ...routes }), ...options });
}

/** A live site with sign-in: poppy.json, protected resource metadata, and issuer metadata. */
export function signInSite(options: { doc?: Doc; prm?: Route; as?: Route; extra?: Record<string, Route> } = {}): Promise<Report> {
    const doc = options.doc ?? base();
    return live(doc, { [PRM_URL]: options.prm ?? { body: goodPrm() }, [AS_URL]: options.as ?? { body: goodAs() }, ...options.extra });
}

/** Checks a document offline. */
export function offline(doc: unknown, servedHost?: string): Report {
    return validateDocument(doc, { servedHost });
}

export function result(report: Report, id: string): RuleResult {
    const found = report.results.find((r) => r.id === id);
    if (!found) throw new Error(`no result for rule ${id}`);
    return found;
}

export function failedErrors(report: Report): string[] {
    return report.results.filter((r) => r.status === "fail" && r.severity === "error").map((r) => r.id);
}
