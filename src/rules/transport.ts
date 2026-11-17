// Section 3: where the document is published and how it is fetched, and whether it is JSON.

import { WELL_KNOWN_PATH } from "../spec.js";
import { isObject, describe } from "../util.js";
import { defineRule, fail, pass, skip } from "./define.js";

export const transportHttps = defineRule(
    {
        id: "transport.https",
        title: "Served over HTTPS, redirects included",
        group: "Transport",
        stage: "transport",
        severity: "error",
        section: "3",
    },
    (ctx) => {
        const http = ctx.http!;
        if (!http.url.startsWith("https://")) {
            return fail(http.url, "poppy.json must be fetched over HTTPS", "Serve the file at an https:// URL.");
        }
        if (http.insecureRedirect) {
            return fail(
                http.insecureRedirect,
                "a redirect on the way to poppy.json goes to a URL that isn't HTTPS, so Personal Agents stop there",
                "Make every redirect target an https:// URL.",
            );
        }
        return pass;
    },
);

export const transportStatus = defineRule(
    {
        id: "transport.status",
        title: "Responds with HTTP 200",
        group: "Transport",
        stage: "transport",
        severity: "error",
        section: "3",
    },
    (ctx) => {
        const http = ctx.http!;
        if (http.status === 200 && !http.error) return pass;
        const where = `https://${ctx.servedHost ?? "{domain}"}${WELL_KNOWN_PATH}`;
        if (http.status === 0 || http.insecureRedirect) {
            return fail(http.finalUrl, `couldn't fetch the document: ${http.error ?? "no response"}`, `Check that ${where} is reachable from the public internet.`);
        }
        if (http.error) {
            return fail(http.finalUrl, `the response couldn't be read: ${http.error}`, "Serve a complete JSON document of reasonable size.");
        }
        if (http.status === 404) {
            return fail(http.finalUrl, "HTTP 404: there is no poppy.json here", `Publish the document at ${where}. Run \`pollen init\` to generate one.`);
        }
        return fail(http.finalUrl, `HTTP ${http.status}, expected 200`, `Make ${where} return 200 with the JSON document.`);
    },
);

export const transportFinalUrl = defineRule(
    {
        id: "transport.final-url",
        title: `Final URL is exactly ${WELL_KNOWN_PATH}, with no query`,
        group: "Transport",
        stage: "transport",
        severity: "error",
        section: "3",
    },
    (ctx) => {
        const http = ctx.http!;
        if (http.hops.length === 0) return skip("No response to check.");
        let url: URL;
        try {
            url = new URL(http.finalUrl);
        } catch {
            return fail(http.finalUrl, "the final URL isn't a valid URL", `Serve the document at ${WELL_KNOWN_PATH}.`);
        }
        if (url.pathname !== WELL_KNOWN_PATH || http.finalUrl.includes("?")) {
            return fail(
                http.finalUrl,
                `after redirects the document is served from ${url.pathname}${url.search}, and Personal Agents only use it when the path is exactly ${WELL_KNOWN_PATH} with no query`,
                `Redirect to a URL whose path is ${WELL_KNOWN_PATH}, or serve the file there directly.`,
            );
        }
        return pass;
    },
);

export const documentJson = defineRule(
    {
        id: "document.json",
        title: "Is a valid JSON object",
        group: "Document",
        stage: "parse",
        severity: "error",
        section: "3.1",
    },
    (ctx) => {
        const raw = ctx.raw ?? "";
        if (raw.charCodeAt(0) === 0xfeff) {
            return fail("$", "the file starts with a byte order mark (BOM), which JSON parsers may reject", "Save the file as UTF-8 without a BOM.");
        }
        if (!ctx.parsed?.ok) {
            return fail("$", `not valid JSON: ${ctx.parsed?.error ?? "empty document"}`, "Fix the syntax. Trailing commas and comments aren't allowed in JSON.");
        }
        if (!isObject(ctx.parsed.value)) {
            return fail("$", `the top level must be a JSON object, got ${describe(ctx.parsed.value)}`, 'Wrap the fields in a single object: { "protocol_version": "1.0", ... }.');
        }
        return pass;
    },
);

export const transportRules = [transportHttps, transportStatus, transportFinalUrl, documentJson];
