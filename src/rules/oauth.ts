// Section 3.2: the protected resource metadata and authorization server metadata that say where
// Personal Agents sign in. These run only against a live URL.

import { authorizationServers } from "../discover.js";
import { GRANT_AUTHORIZATION_CODE, GRANT_DEVICE_CODE, GRANT_REFRESH, MEDIATED_SIGN_IN, MEDIATED_SIGN_IN_GRANT } from "../spec.js";
import type { Context, OAuthDiscovery } from "../types.js";
import { Problems, describe, isHttpsUrl, isObject, show, type Json } from "../util.js";
import { listsMediatedSignIn, signedInPaths } from "./auth.js";
import { defineRule, docOf, fail, pass, skip } from "./define.js";

function oauthOf(ctx: Context): OAuthDiscovery {
    if (!ctx.oauth) throw new Error("oauth-stage rule ran without discovery");
    return ctx.oauth;
}

function domainOf(ctx: Context): string {
    const org = docOf(ctx).organization;
    return isObject(org) && typeof org.domain === "string" ? org.domain : "";
}

/** The authorization server metadata, when it was fetched and is a JSON object. */
function serverMetadata(oauth: OAuthDiscovery): Json | undefined {
    const json = oauth.serverMetadataJson;
    return oauth.serverMetadata?.status === 200 && json?.ok && isObject(json.value) ? json.value : undefined;
}

export const resourceMetadata = defineRule(
    {
        id: "oauth.resource-metadata",
        title: "Protected resource metadata is valid JSON, or a clean 404",
        group: "OAuth metadata",
        stage: "oauth",
        severity: "error",
        section: "3.2",
    },
    (ctx) => {
        const oauth = oauthOf(ctx);
        const http = oauth.resourceMetadata;
        if (http.status === 404) return pass;
        const fallback = "Personal Agents must not treat this as \"no issuer\", so they won't use the Company at all";
        if (http.status === 0 || http.error) {
            return fail(oauth.resourceMetadataUrl, `couldn't fetch it: ${http.error ?? "no response"}. ${fallback}`, "Serve the metadata as JSON, or return 404 if you have no OAuth issuer.");
        }
        if (http.status !== 200) {
            return fail(oauth.resourceMetadataUrl, `HTTP ${http.status}. Only 200 or 404 is usable, and ${fallback.charAt(0).toLowerCase()}${fallback.slice(1)}`, "Return 200 with the metadata, or 404 if you have no OAuth issuer.");
        }
        const json = oauth.resourceMetadataJson;
        if (!json?.ok || !isObject(json.value)) {
            return fail(oauth.resourceMetadataUrl, `the response isn't a JSON object${json?.error ? ` (${json.error})` : ""}. ${fallback}`, "Serve RFC 9728 metadata: { \"resource\": \"https://example.com\", \"authorization_servers\": [ ... ] }.");
        }
        return pass;
    },
);

export const resourceMatches = defineRule(
    {
        id: "oauth.resource",
        title: "Protected resource metadata names this domain",
        group: "OAuth metadata",
        stage: "oauth",
        severity: "error",
        section: "3.2",
    },
    (ctx) => {
        const oauth = oauthOf(ctx);
        const json = oauth.resourceMetadataJson;
        if (oauth.resourceMetadata.status !== 200 || !json?.ok || !isObject(json.value)) return skip("No protected resource metadata.");
        const expected = `https://${domainOf(ctx).toLowerCase()}`;
        const resource = json.value.resource;
        // Exactly the domain: no path or trailing slash. Hosts compare ignoring case (spec 3.1).
        if (typeof resource === "string" && resource.toLowerCase() === expected) return pass;
        return fail(
            `${oauth.resourceMetadataUrl} → resource`,
            resource === undefined ? "resource is missing" : `resource is ${show(resource)}, but must be exactly ${show(expected)}`,
            `Set "resource": "${expected}", with no path or trailing slash.`,
        );
    },
);

export const issuerSelection = defineRule(
    {
        id: "oauth.issuer",
        title: "auth.issuer agrees with the authorization servers listed",
        group: "OAuth metadata",
        stage: "oauth",
        severity: "error",
        section: "3.2",
    },
    (ctx) => {
        const doc = docOf(ctx);
        const oauth = oauthOf(ctx);
        const status = oauth.resourceMetadata.status;
        const json = oauth.resourceMetadataJson;
        const usable = status === 404 || (status === 200 && json?.ok && isObject(json.value));
        if (!usable) return skip("Protected resource metadata is unusable; see oauth.resource-metadata.");
        const issuer = isObject(doc.auth) ? doc.auth.issuer : undefined;
        const listed = status === 200 && isObject(json?.value) ? json.value.authorization_servers : undefined;
        const prm = `${oauth.resourceMetadataUrl} → authorization_servers`;
        if (listed !== undefined && !Array.isArray(listed)) {
            return fail(prm, `must be an array of issuer URLs, got ${describe(listed)}`, 'Use [ "https://auth.example.com" ].');
        }
        const servers = authorizationServers(oauth) ?? [];
        const problems = new Problems();
        servers.forEach((server, i) => {
            if (!isHttpsUrl(server)) problems.add(`${prm}[${i}]`, `${show(server)} isn't an HTTPS issuer URL`, "List each issuer as an https:// URL.");
        });

        if (servers.length === 0) {
            const why = status === 404 ? "there's no protected resource metadata (404)" : "the protected resource metadata lists no authorization server";
            if (issuer !== undefined) {
                problems.add("auth.issuer", `auth.issuer is set, but ${why}, so Personal Agents find no issuer`, `Publish ${oauth.resourceMetadataUrl} listing ${show(issuer)} in authorization_servers, or remove auth.issuer.`);
            }
            for (const path of signedInPaths(doc)) {
                problems.add(path, `"signed_in" access needs an OAuth issuer, but ${why}`, `Publish ${oauth.resourceMetadataUrl} naming your issuer, or use "session".`);
            }
            if (listsMediatedSignIn(doc)) {
                problems.add(`extensions["${MEDIATED_SIGN_IN}"]`, `Mediated Sign-In runs at the issuer's token endpoint, but ${why}`, `Publish ${oauth.resourceMetadataUrl} naming your issuer, or remove the extension.`);
            }
        } else if (servers.length === 1) {
            if (issuer !== undefined && issuer !== servers[0]) {
                problems.add("auth.issuer", `auth.issuer is ${show(issuer)}, but the only authorization server listed is ${show(servers[0])}`, `Set auth.issuer to ${show(servers[0])}, or remove it.`);
            }
        } else if (issuer === undefined) {
            problems.add("auth.issuer", `the protected resource metadata lists ${servers.length} authorization servers, so auth.issuer must say which one Personal Agents use`, `Set auth.issuer to one of: ${servers.map(show).join(", ")}.`);
        } else if (!servers.includes(issuer)) {
            problems.add("auth.issuer", `${show(issuer)} isn't one of the authorization servers listed (${servers.map(show).join(", ")})`, "Set auth.issuer to one of them, or add it to authorization_servers.");
        }
        return problems.outcome;
    },
);

export const serverMetadataIssuer = defineRule(
    {
        id: "oauth.server-metadata",
        title: "Issuer publishes metadata with a matching issuer",
        group: "OAuth metadata",
        stage: "oauth",
        severity: "error",
        section: "3.2",
    },
    (ctx) => {
        const oauth = oauthOf(ctx);
        if (!oauth.issuer || !oauth.serverMetadataUrl || !oauth.serverMetadata) return skip("No issuer selected.");
        const http = oauth.serverMetadata;
        const where = oauth.serverMetadataUrl;
        if (http.status === 0 || http.error) return fail(where, `couldn't fetch the authorization server metadata: ${http.error ?? "no response"}`, "Publish RFC 8414 metadata at this URL.");
        if (http.status !== 200) return fail(where, `HTTP ${http.status}, expected 200`, "Publish RFC 8414 metadata at this URL (the well-known segment goes before the issuer's path).");
        const meta = serverMetadata(oauth);
        if (!meta) return fail(where, `not a JSON object${oauth.serverMetadataJson?.error ? ` (${oauth.serverMetadataJson.error})` : ""}`, "Serve the metadata as a JSON object.");
        if (meta.issuer !== oauth.issuer) {
            return fail(`${where} → issuer`, `issuer is ${show(meta.issuer)}, but must match ${show(oauth.issuer)} character for character`, `Set "issuer": "${oauth.issuer}".`);
        }
        return pass;
    },
);

export const protectedResources = defineRule(
    {
        id: "oauth.protected-resources",
        title: "Issuer lists this domain in protected_resources",
        group: "OAuth metadata",
        stage: "oauth",
        severity: "error",
        section: "3.2",
    },
    (ctx) => {
        const oauth = oauthOf(ctx);
        const meta = serverMetadata(oauth);
        if (!meta) return skip("No authorization server metadata.");
        const expected = `https://${domainOf(ctx).toLowerCase()}`;
        const listed = meta.protected_resources;
        const where = `${oauth.serverMetadataUrl} → protected_resources`;
        if (!Array.isArray(listed)) {
            return fail(where, listed === undefined ? "protected_resources is missing" : `must be an array, got ${describe(listed)}`, `Add "protected_resources": [ "${expected}" ].`);
        }
        if (listed.some((entry) => typeof entry === "string" && entry.toLowerCase() === expected)) return pass;
        const close = listed.find((entry) => typeof entry === "string" && entry.toLowerCase().replace(/\/+$/, "") === expected);
        return fail(
            where,
            close ? `lists ${show(close)}, which has a trailing slash or path` : `doesn't list ${expected}, so the issuer doesn't confirm it serves this domain and Personal Agents won't trust the link`,
            `Add "${expected}" to protected_resources, with no path or trailing slash.`,
        );
    },
);

export const serverEndpoints = defineRule(
    {
        id: "oauth.endpoints",
        title: "Issuer metadata has the endpoints and grants Poppy needs",
        group: "OAuth metadata",
        stage: "oauth",
        severity: "error",
        section: "3.2",
    },
    (ctx) => {
        const oauth = oauthOf(ctx);
        const meta = serverMetadata(oauth);
        if (!meta) return skip("No authorization server metadata.");
        const at = (field: string) => `${oauth.serverMetadataUrl} → ${field}`;
        const problems = new Problems();
        problems.https(at("token_endpoint"), meta.token_endpoint, "token_endpoint");
        problems.https(at("revocation_endpoint"), meta.revocation_endpoint, "revocation_endpoint");
        const grants = meta.grant_types_supported;
        if (!Array.isArray(grants)) {
            problems.add(at("grant_types_supported"), grants === undefined ? "grant_types_supported is missing, and Poppy requires it" : `must be an array, got ${describe(grants)}`, `Add "grant_types_supported": [ "${GRANT_REFRESH}", "${GRANT_AUTHORIZATION_CODE}" ].`);
            return problems.outcome;
        }
        if (!grants.includes(GRANT_REFRESH)) {
            problems.add(at("grant_types_supported"), `doesn't include "${GRANT_REFRESH}", which Poppy requires`, `Add "${GRANT_REFRESH}".`);
        }
        if (grants.includes(GRANT_AUTHORIZATION_CODE)) {
            problems.https(at("authorization_endpoint"), meta.authorization_endpoint, "authorization_endpoint (required for Direct Sign-In)");
        }
        if (grants.includes(GRANT_DEVICE_CODE)) {
            problems.https(at("device_authorization_endpoint"), meta.device_authorization_endpoint, "device_authorization_endpoint (required for Device Sign-In)");
        }
        return problems.outcome;
    },
);

export const scopesSupported = defineRule(
    {
        id: "oauth.scopes-supported",
        title: "Scopes in poppy.json are listed in scopes_supported",
        group: "OAuth metadata",
        stage: "oauth",
        severity: "warning",
        section: "3.2",
    },
    (ctx) => {
        const doc = docOf(ctx);
        const oauth = oauthOf(ctx);
        const meta = serverMetadata(oauth);
        if (!meta) return skip("No authorization server metadata.");
        if (isObject(doc.auth) && doc.auth.disabled === true) return skip("auth.disabled: sign-in is off.");
        const named = new Set<string>();
        if (isObject(doc.auth) && isObject(doc.auth.scopes)) for (const name of Object.keys(doc.auth.scopes)) named.add(name);
        const mediated = isObject(doc.extensions) ? doc.extensions[MEDIATED_SIGN_IN] : undefined;
        if (Array.isArray(mediated)) {
            for (const entry of mediated) {
                if (isObject(entry) && Array.isArray(entry.scopes)) for (const scope of entry.scopes) if (typeof scope === "string") named.add(scope);
            }
        }
        if (named.size === 0) return skip("poppy.json names no scopes.");
        const supported = new Set<string>();
        const collect = (list: unknown) => {
            if (Array.isArray(list)) for (const scope of list) if (typeof scope === "string") supported.add(scope);
        };
        collect(meta.scopes_supported);
        const prm = oauth.resourceMetadataJson;
        if (oauth.resourceMetadata.status === 200 && prm?.ok && isObject(prm.value)) collect(prm.value.scopes_supported);
        const missing = [...named].filter((scope) => !supported.has(scope));
        if (missing.length === 0) return pass;
        return fail(
            `${oauth.serverMetadataUrl} → scopes_supported`,
            `${missing.map(show).join(", ")} ${missing.length === 1 ? "is" : "are"} named in poppy.json but not in scopes_supported, in either the issuer's metadata or the protected resource metadata`,
            "List every scope a Personal Agent can request in scopes_supported, in one or both metadata documents.",
        );
    },
);

export const signInGrant = defineRule(
    {
        id: "oauth.sign-in-grant",
        title: "Issuer offers a way to sign in, or auth.disabled says it doesn't",
        group: "OAuth metadata",
        stage: "oauth",
        severity: "warning",
        section: "3.2",
    },
    (ctx) => {
        const doc = docOf(ctx);
        const oauth = oauthOf(ctx);
        const meta = serverMetadata(oauth);
        if (!meta || !Array.isArray(meta.grant_types_supported)) return skip("No grant types to check.");
        if (isObject(doc.auth) && doc.auth.disabled === true) return skip("auth.disabled: sign-in is off.");
        const grants = meta.grant_types_supported;
        if (grants.includes(GRANT_AUTHORIZATION_CODE) || grants.includes(GRANT_DEVICE_CODE)) return pass;
        if (listsMediatedSignIn(doc) && grants.includes(MEDIATED_SIGN_IN_GRANT)) return pass;
        return fail(
            `${oauth.serverMetadataUrl} → grant_types_supported`,
            "the Company has an issuer but offers no Direct, Device, or Mediated Sign-In grant, so Personal Agents can't sign Users in",
            `Add "${GRANT_AUTHORIZATION_CODE}" for Direct Sign-In, or set auth.disabled to true in poppy.json if you don't offer sign-in yet.`,
        );
    },
);

export const mediatedGrant = defineRule(
    {
        id: "oauth.mediated-grant",
        title: "Issuer supports the Mediated Sign-In grant it advertises",
        group: "OAuth metadata",
        stage: "oauth",
        severity: "error",
        section: "Mediated Sign-In 2",
    },
    (ctx) => {
        const doc = docOf(ctx);
        if (!listsMediatedSignIn(doc)) return skip("Mediated Sign-In isn't listed.");
        const oauth = oauthOf(ctx);
        const meta = serverMetadata(oauth);
        if (!meta) return skip("No authorization server metadata.");
        const grants = meta.grant_types_supported;
        if (Array.isArray(grants) && grants.includes(MEDIATED_SIGN_IN_GRANT)) return pass;
        return fail(
            `${oauth.serverMetadataUrl} → grant_types_supported`,
            "poppy.json lists the Mediated Sign-In extension, but the issuer doesn't list its grant type",
            `Add "${MEDIATED_SIGN_IN_GRANT}" to grant_types_supported, or remove the extension.`,
        );
    },
);

export const oauthRules = [
    resourceMetadata,
    resourceMatches,
    issuerSelection,
    serverMetadataIssuer,
    protectedResources,
    serverEndpoints,
    scopesSupported,
    signInGrant,
    mediatedGrant,
];
