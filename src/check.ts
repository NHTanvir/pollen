// Runs the rules against a live URL, a local file, or an in-memory document, and scores the result.
// Deterministic: the same responses always give the same report.

import { existsSync, readFileSync, statSync } from "node:fs";
import { discoverOAuth } from "./discover.js";
import { fetchFollowing, parseJson, type Fetcher } from "./fetch.js";
import { RULES } from "./rules/index.js";
import { SPEC_VERSION, WELL_KNOWN_PATH } from "./spec.js";
import type { Context, Report, Rule, RuleResult, Summary } from "./types.js";
import { hostOf, isDomain, isObject } from "./util.js";
import { VERSION } from "./version.js";

export interface CheckOptions {
    fetcher?: Fetcher;
    /** Per-request timeout. Default 10 s. */
    timeoutMs?: number;
    /** Don't fetch the OAuth metadata. */
    skipOAuth?: boolean;
}

export type Target = { mode: "file"; path: string; notes: string[] } | { mode: "url"; url: string; notes: string[] };

/** Weight of a rule in the score. Errors count for more than warnings. */
export const WEIGHTS = { error: 10, warning: 3 } as const;

/**
 * Works out what the user meant: an existing file, a URL, or a bare domain. A URL with no path, or
 * a domain, means that host's /.well-known/poppy.json. http:// becomes https://, because Personal
 * Agents only ever fetch the document over HTTPS.
 */
export function resolveTarget(input: string): Target {
    if (existsSync(input) && statSync(input).isFile()) {
        return { mode: "file", path: input, notes: ["Local file. After you deploy, check the live domain too: that also tests HTTPS, redirects, the host, and OAuth metadata."] };
    }
    const notes: string[] = [];
    let text = input.trim();
    if (/^http:\/\//i.test(text)) {
        text = text.replace(/^http:/i, "https:");
        notes.push("Checked over https://: Personal Agents only fetch poppy.json over HTTPS.");
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
        if (!isDomain(text.replace(/\/.*$/, ""))) throw new TargetError(`"${input}" isn't a file, a URL, or a domain name.`);
        text = `https://${text}`;
    }
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        throw new TargetError(`"${input}" isn't a valid URL.`);
    }
    if (url.protocol !== "https:") throw new TargetError(`"${input}" isn't an HTTPS URL.`);
    if (url.pathname === "/" && !url.search) url.pathname = WELL_KNOWN_PATH;
    return { mode: "url", url: url.href, notes };
}

export class TargetError extends Error {}

/** Checks a URL, domain, or file path. */
export async function check(input: string, options: CheckOptions = {}): Promise<Report> {
    const target = resolveTarget(input);
    if (target.mode === "file") {
        const ctx: Context = { mode: "file", target: target.path };
        readText(ctx, readFileSync(target.path, "utf8"));
        return evaluate(ctx, target.notes);
    }

    const fetchOptions = { fetcher: options.fetcher, timeoutMs: options.timeoutMs };
    const http = await fetchFollowing(target.url, fetchOptions);
    const ctx: Context = { mode: "url", target: target.url, http, servedHost: hostOf(http.finalUrl) };
    if (http.status === 200 && !http.error && http.body !== undefined) readText(ctx, http.body);

    const org = ctx.doc && isObject(ctx.doc.organization) ? ctx.doc.organization : undefined;
    if (!ctx.doc) {
        ctx.oauthSkipped = ctx.raw === undefined ? "No document was retrieved." : "No JSON object to check.";
    } else if (options.skipOAuth) {
        ctx.oauthSkipped = "Skipped with --skip-oauth.";
    } else if (!org || !isDomain(org.domain)) {
        ctx.oauthSkipped = "organization.domain isn't valid, so there's no domain to discover OAuth metadata on.";
    } else {
        ctx.oauth = await discoverOAuth(org.domain, ctx.doc, fetchOptions);
    }
    return evaluate(ctx, target.notes);
}

/**
 * Checks a document you already have, as a JSON string or a parsed value. Pass servedHost to also
 * check organization.domain against the host that will serve it. No network access.
 */
export function validateDocument(document: unknown, options: { servedHost?: string; label?: string } = {}): Report {
    const ctx: Context = { mode: "file", target: options.label ?? "<document>" };
    readText(ctx, typeof document === "string" ? document : JSON.stringify(document));
    if (options.servedHost) {
        ctx.mode = "url";
        ctx.servedHost = options.servedHost.toLowerCase();
        ctx.oauthSkipped = "In-memory document: OAuth metadata isn't fetched.";
    }
    return evaluate(ctx, []);
}

/** Parses the text into ctx. A BOM is reported by document.json but doesn't stop the other rules. */
function readText(ctx: Context, raw: string): void {
    ctx.raw = raw;
    ctx.parsed = parseJson(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    if (ctx.parsed.ok && isObject(ctx.parsed.value)) ctx.doc = ctx.parsed.value;
}

function skipReason(rule: Rule, ctx: Context): string | undefined {
    switch (rule.stage) {
        case "transport":
            return ctx.http ? undefined : "Local file: transport is checked only against a live URL.";
        case "parse":
            return ctx.raw === undefined ? "No document was retrieved." : undefined;
        case "document":
            if (ctx.doc) return undefined;
            return ctx.raw === undefined ? "No document was retrieved." : "No JSON object to check.";
        case "oauth":
            if (ctx.oauth) return undefined;
            if (ctx.mode === "file") return "Local file: OAuth metadata is checked only against a live URL.";
            return ctx.oauthSkipped ?? "OAuth metadata wasn't fetched.";
    }
}

function runRule(rule: Rule, ctx: Context): RuleResult {
    const base = { id: rule.id, title: rule.title, group: rule.group, severity: rule.severity, section: rule.section, spec_url: rule.specUrl };
    const reason = skipReason(rule, ctx);
    if (reason) return { ...base, status: "skip", note: reason, problems: [] };
    try {
        const outcome = rule.check(ctx);
        if (outcome.status === "skip") return { ...base, status: "skip", note: outcome.note, problems: [] };
        if (outcome.status === "pass") return { ...base, status: "pass", problems: [] };
        return { ...base, status: "fail", problems: outcome.problems };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ...base, status: "fail", problems: [{ path: "$", message: `Pollen hit an internal error: ${message}`, fix: "Please report this at https://github.com/NHTanvir/pollen/issues." }] };
    }
}

export function score(results: RuleResult[]): number {
    let total = 0;
    let earned = 0;
    for (const result of results) {
        if (result.status === "skip") continue;
        const weight = WEIGHTS[result.severity];
        total += weight;
        if (result.status === "pass") earned += weight;
    }
    return total === 0 ? 0 : Math.floor((100 * earned) / total);
}

function evaluate(ctx: Context, notes: string[]): Report {
    const results = RULES.map((rule) => runRule(rule, ctx));
    const summary: Summary = { passed: 0, errors: 0, warnings: 0, skipped: 0 };
    for (const result of results) {
        if (result.status === "pass") summary.passed++;
        else if (result.status === "skip") summary.skipped++;
        else if (result.severity === "error") summary.errors++;
        else summary.warnings++;
    }
    const report: Report = {
        tool: { name: "pollen", version: VERSION },
        spec_version: SPEC_VERSION,
        target: ctx.target,
        mode: ctx.mode,
        score: ctx.doc ? score(results) : 0,
        ok: summary.errors === 0 && ctx.doc !== undefined,
        summary,
        notes: [...notes],
        results,
    };
    if (ctx.http) report.final_url = ctx.http.finalUrl;
    return report;
}
