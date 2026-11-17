// pollen init: asks a few questions and writes a starter poppy.json that passes `pollen check`.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { validateDocument } from "./check.js";
import { PROTECTED_RESOURCE_PATH, SPEC_VERSION, WELL_KNOWN_PATH } from "./spec.js";
import { hostOf, isDomain, isHttpsUrl, type Json } from "./util.js";

export interface InitAnswers {
    name: string;
    domain: string;
    /** OAuth issuer, when the Company offers sign-in. */
    issuer?: string;
    /** Whether Personal Agents may browse the website. */
    website: boolean;
    browserSessionEndpoint?: string;
    agentEndpoint?: string;
    agentDescription?: string;
    openapiUrl?: string;
    openapiDescription?: string;
    mcpUrl?: string;
    mcpDescription?: string;
}

/** Builds the document. Fields come out in the order the spec's example uses. */
export function generatePoppy(answers: InitAnswers): Json {
    const doc: Json = {
        protocol_version: SPEC_VERSION,
        organization: { name: answers.name, domain: answers.domain.toLowerCase() },
    };
    if (answers.issuer) doc.auth = { issuer: answers.issuer };
    if (answers.agentEndpoint) {
        doc.agent = {
            protocols: [{ type: "poppy", endpoint: answers.agentEndpoint, description: answers.agentDescription || `Anything about ${answers.name}` }],
        };
    }
    const apis: Json[] = [];
    if (answers.openapiUrl) apis.push({ type: "openapi", url: answers.openapiUrl, description: answers.openapiDescription || `${answers.name} API` });
    if (answers.mcpUrl) apis.push({ type: "mcp", url: answers.mcpUrl, description: answers.mcpDescription || `${answers.name} tools` });
    if (apis.length > 0) doc.apis = apis;

    const otherChannel = doc.agent !== undefined || doc.apis !== undefined;
    if (answers.website || !otherChannel) {
        // Spec 3.1 needs at least one channel; a website agents may browse is the simplest.
        doc.web = answers.browserSessionEndpoint ? { browser_session_endpoint: answers.browserSessionEndpoint } : {};
    } else {
        doc.web = { disabled: true };
    }
    return doc;
}

export type Ask = (question: string, defaultValue?: string) => Promise<string>;

export class InitAborted extends Error {
    constructor() {
        super("input ended before every question was answered");
    }
}

/** Asks until the answer is valid. An empty answer takes the default. */
async function askValid(ask: Ask, say: (line: string) => void, question: string, check: (value: string) => string | undefined, defaultValue?: string): Promise<string> {
    for (;;) {
        const value = await ask(question, defaultValue);
        const problem = check(value);
        if (!problem) return value;
        say(`  ${problem}`);
    }
}

const optionalHttps = (value: string) => (value === "" || isHttpsUrl(value) ? undefined : "Enter a full https:// URL, or leave it blank.");

/** Accepts "example.com", "https://example.com/" or "Example.com", and returns the host. */
export function normalizeDomain(value: string): string | undefined {
    const text = value.trim();
    const host = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? hostOf(text) : text.replace(/\/+$/, "").toLowerCase();
    return host && isDomain(host) ? host.replace(/:443$/, "") : undefined;
}

function yes(value: string): boolean | undefined {
    if (/^(y|yes)$/i.test(value)) return true;
    if (/^(n|no)$/i.test(value)) return false;
    return undefined;
}

export async function askQuestions(ask: Ask, say: (line: string) => void): Promise<InitAnswers> {
    const name = await askValid(ask, say, "Company name", (v) => (v ? undefined : "The name is required."));
    const domainText = await askValid(ask, say, "Domain that will serve poppy.json, such as example.com", (v) => (normalizeDomain(v) ? undefined : "Enter a host name such as example.com, without a path."));
    const domain = normalizeDomain(domainText)!;

    say("");
    say("Sign-in. Personal Agents sign Users in through your OAuth issuer (Direct Sign-In).");
    const issuer = await askValid(ask, say, "OAuth issuer URL, where Users sign in (blank if you don't offer sign-in yet)", optionalHttps);

    say("");
    say("Interfaces. Leave a question blank to skip that interface.");
    const browse = await askValid(ask, say, "May Personal Agents browse your website? [Y/n]", (v) => (yes(v || "y") === undefined ? "Answer y or n." : undefined));
    const website = yes(browse || "y")!;
    let browserSessionEndpoint = "";
    if (website) {
        browserSessionEndpoint = await askValid(ask, say, "Browser session endpoint, if you support browser join", optionalHttps);
    }
    const agentEndpoint = await askValid(ask, say, "Company agent conversation endpoint (Poppy protocol)", optionalHttps);
    const agentDescription = agentEndpoint ? await ask("  What can your agent help with?", `Anything about ${name}`) : "";
    const openapiUrl = await askValid(ask, say, "OpenAPI description URL", optionalHttps);
    const openapiDescription = openapiUrl ? await ask("  What is the API for?", `${name} API`) : "";
    const mcpUrl = await askValid(ask, say, "MCP server URL", optionalHttps);
    const mcpDescription = mcpUrl ? await ask("  What do the MCP tools do?", `${name} tools`) : "";

    if (!website && !agentEndpoint && !openapiUrl && !mcpUrl) {
        say("");
        say("Poppy needs at least one channel, so the website is listed for signed-out browsing.");
    }
    return {
        name,
        domain,
        issuer: issuer || undefined,
        website,
        browserSessionEndpoint: browserSessionEndpoint || undefined,
        agentEndpoint: agentEndpoint || undefined,
        agentDescription: agentDescription || undefined,
        openapiUrl: openapiUrl || undefined,
        openapiDescription: openapiDescription || undefined,
        mcpUrl: mcpUrl || undefined,
        mcpDescription: mcpDescription || undefined,
    };
}

/** Reads answers one line at a time, from a terminal or a pipe. */
export function lineReader(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): { ask: Ask; close: () => void } {
    const rl = createInterface({ input, terminal: false });
    const lines: string[] = [];
    const waiting: ((line: string | undefined) => void)[] = [];
    let closed = false;
    rl.on("line", (line) => {
        const resolve = waiting.shift();
        if (resolve) resolve(line);
        else lines.push(line);
    });
    rl.on("close", () => {
        closed = true;
        for (const resolve of waiting.splice(0)) resolve(undefined);
    });
    const ask: Ask = async (question, defaultValue) => {
        output.write(`${question}${defaultValue ? ` [${defaultValue}]` : ""}: `);
        const line = lines.length > 0 ? lines.shift() : closed ? undefined : await new Promise<string | undefined>((resolve) => waiting.push(resolve));
        if (line === undefined) throw new InitAborted();
        const value = line.trim();
        return value === "" ? (defaultValue ?? "") : value;
    };
    return { ask, close: () => rl.close() };
}

export interface InitOptions {
    out: string;
    force: boolean;
    input: NodeJS.ReadableStream;
    output: NodeJS.WritableStream;
    /** Where errors go. Default process.stderr. */
    errors?: NodeJS.WritableStream;
}

export async function runInit(options: InitOptions): Promise<number> {
    const say = (line: string) => options.output.write(`${line}\n`);
    const errors = options.errors ?? process.stderr;
    if (existsSync(options.out) && !options.force) {
        errors.write(`pollen: ${options.out} already exists. Use --force to overwrite it, or --out to pick another path.\n`);
        return 2;
    }
    say(`pollen init: a starter poppy.json for Personal Agent Protocol ${SPEC_VERSION}.`);
    say("");
    const reader = lineReader(options.input, options.output);
    let answers: InitAnswers;
    try {
        answers = await askQuestions(reader.ask, say);
    } catch (error) {
        if (error instanceof InitAborted) {
            say("");
            errors.write(`pollen: ${error.message}; nothing was written.\n`);
            return 2;
        }
        throw error;
    } finally {
        reader.close();
    }

    const doc = generatePoppy(answers);
    const report = validateDocument(doc, { servedHost: answers.domain });
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(doc, null, 2)}\n`);

    say("");
    say(`Wrote ${options.out} (pollen score ${report.score}/100).`);
    say("");
    say("Next steps");
    say(`  1. Serve it at https://${answers.domain}${WELL_KNOWN_PATH}`);
    say(`     (in Next.js, Vite or Astro: public${WELL_KNOWN_PATH}).`);
    if (answers.issuer) {
        say(`  2. Publish https://${answers.domain}${PROTECTED_RESOURCE_PATH}:`);
        say(`     { "resource": "https://${answers.domain}", "authorization_servers": ["${answers.issuer}"] }`);
        say(`     and list "https://${answers.domain}" in your issuer's protected_resources.`);
        say(`  3. Check it: npx @nhtanvir/pollen check ${answers.domain}`);
    } else {
        say(`  2. Check it: npx @nhtanvir/pollen check ${answers.domain}`);
    }
    return report.ok ? 0 : 1;
}
