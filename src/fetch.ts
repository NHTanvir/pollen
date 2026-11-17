// Fetching with redirects followed by hand, so each hop can be checked for HTTPS (spec 3).

import type { HttpHop, HttpResult, JsonResult } from "./types.js";
import { VERSION } from "./version.js";

/** The subset of fetch Pollen uses. Tests pass a fake one. */
export type Fetcher = (url: string, init: { redirect: "manual"; headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

export interface FetchOptions {
    fetcher?: Fetcher;
    timeoutMs?: number;
}

export const USER_AGENT = `pollen/${VERSION} (+https://github.com/NHTanvir/pollen)`;
const MAX_REDIRECTS = 10;
const MAX_BYTES = 1_000_000;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export async function fetchFollowing(url: string, options: FetchOptions = {}): Promise<HttpResult> {
    const fetcher = options.fetcher ?? (globalThis.fetch as unknown as Fetcher);
    const timeoutMs = options.timeoutMs ?? 10_000;
    const hops: HttpHop[] = [];
    let current = url;

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
        let response: Response;
        try {
            response = await fetcher(current, {
                redirect: "manual",
                headers: { accept: "application/json", "user-agent": USER_AGENT },
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error) {
            return { url, finalUrl: current, hops, status: 0, error: errorText(error, timeoutMs) };
        }
        hops.push({ url: current, status: response.status });

        const location = response.headers.get("location");
        if (REDIRECTS.has(response.status) && location) {
            await response.body?.cancel().catch(() => undefined);
            let next: string;
            try {
                next = new URL(location, current).href;
            } catch {
                return { url, finalUrl: current, hops, status: response.status, error: `redirect to an invalid URL: ${location}` };
            }
            if (!next.startsWith("https://")) {
                return { url, finalUrl: current, hops, status: response.status, insecureRedirect: next, error: `redirect to a URL that isn't HTTPS: ${next}` };
            }
            current = next;
            continue;
        }

        try {
            const body = await response.text();
            if (body.length > MAX_BYTES) {
                return { url, finalUrl: current, hops, status: response.status, error: `the response is larger than ${MAX_BYTES} bytes` };
            }
            return { url, finalUrl: current, hops, status: response.status, body };
        } catch (error) {
            return { url, finalUrl: current, hops, status: response.status, error: errorText(error, timeoutMs) };
        }
    }
    return { url, finalUrl: current, hops, status: 0, error: `more than ${MAX_REDIRECTS} redirects` };
}

export function parseJson(text: string | undefined): JsonResult {
    if (text === undefined || text.trim() === "") return { ok: false, error: "the document is empty" };
    try {
        return { ok: true, value: JSON.parse(text) as unknown };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

function errorText(error: unknown, timeoutMs: number): string {
    if (error instanceof Error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") return `timed out after ${timeoutMs} ms`;
        const cause = (error as { cause?: { code?: string; message?: string } }).cause;
        if (cause?.code) return `${cause.code}${cause.message ? `: ${cause.message}` : ""}`;
        return error.message;
    }
    return String(error);
}
