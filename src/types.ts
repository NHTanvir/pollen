// Shared types for the validator, the report, and the library API.

export type Severity = "error" | "warning";
export type Status = "pass" | "fail" | "skip";

/** Where a rule sits in the report. Rules print grouped, in this order. */
export const GROUPS = [
    "Transport",
    "Document",
    "Channels",
    "Sign-in",
    "Extensions",
    "OAuth metadata",
] as const;
export type Group = (typeof GROUPS)[number];

/**
 * When a rule can run. check.ts skips a whole stage at once: transport and oauth need a live URL,
 * parse needs some text, and document needs a JSON object.
 */
export type Stage = "transport" | "parse" | "document" | "oauth";

/** One concrete thing wrong, with where it is and how to fix it. */
export interface Problem {
    /** A JSON path into the document, such as `agent.protocols[0].endpoint`, or a URL. */
    path: string;
    message: string;
    fix: string;
}

export type Outcome =
    | { status: "pass" }
    | { status: "skip"; note: string }
    | { status: "fail"; problems: Problem[] };

export interface HttpHop {
    url: string;
    status: number;
}

/** The result of fetching one URL, following redirects. */
export interface HttpResult {
    /** The URL first requested. */
    url: string;
    /** The last URL reached, after redirects. */
    finalUrl: string;
    /** Every response on the way, redirects included. */
    hops: HttpHop[];
    /** Final status, or 0 when no response arrived. */
    status: number;
    body?: string;
    /** Network error, timeout, or a redirect Pollen refused to follow. */
    error?: string;
    /** A redirect to a URL that isn't HTTPS, if one was seen. */
    insecureRedirect?: string;
}

export interface JsonResult {
    ok: boolean;
    value?: unknown;
    error?: string;
}

/** Discovery of the Company's OAuth issuer, spec 3.2. */
export interface OAuthDiscovery {
    resourceMetadataUrl: string;
    resourceMetadata: HttpResult;
    resourceMetadataJson?: JsonResult;
    /** The issuer a Personal Agent would select, if any. */
    issuer?: string;
    serverMetadataUrl?: string;
    serverMetadata?: HttpResult;
    serverMetadataJson?: JsonResult;
}

/** Everything a rule may look at. Rules never fetch: check.ts fetches first. */
export interface Context {
    mode: "url" | "file";
    target: string;
    /** URL mode: the fetch of /.well-known/poppy.json. */
    http?: HttpResult;
    /** URL mode: host[:port] that served the document, after redirects. */
    servedHost?: string;
    /** Raw document text, when there was any. */
    raw?: string;
    parsed?: JsonResult;
    /** The parsed document, when it is a JSON object. */
    doc?: Record<string, unknown>;
    /** URL mode, unless OAuth checks were skipped. */
    oauth?: OAuthDiscovery;
    /** Why oauth is absent in URL mode, such as --skip-oauth. */
    oauthSkipped?: string;
}

export interface Rule {
    id: string;
    title: string;
    group: Group;
    stage: Stage;
    severity: Severity;
    /** Spec section number, such as "3.1". */
    section: string;
    /** Absolute URL of the section in the spec. */
    specUrl: string;
    check(ctx: Context): Outcome;
}

export interface RuleResult {
    id: string;
    title: string;
    group: Group;
    severity: Severity;
    section: string;
    spec_url: string;
    status: Status;
    note?: string;
    problems: Problem[];
}

export interface Summary {
    passed: number;
    errors: number;
    warnings: number;
    skipped: number;
}

export interface Report {
    tool: { name: "pollen"; version: string };
    spec_version: string;
    target: string;
    mode: "url" | "file";
    /** URL mode: where the document was finally served from. */
    final_url?: string;
    /** 0-100. Weighted share of applicable rules that passed. */
    score: number;
    /** False when any error-severity rule failed. */
    ok: boolean;
    summary: Summary;
    notes: string[];
    results: RuleResult[];
}
