// One table of cases per rule: each rule needs at least one passing and one failing case, and the
// coverage test at the bottom fails if a rule is added without them.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RULES } from "../src/rules/index.js";
import type { Report, Status } from "../src/types.js";
import {
    DOMAIN,
    ISSUER,
    ORIGIN,
    PRM_URL,
    WELL_KNOWN,
    base,
    goodAs,
    goodPrm,
    live,
    make,
    networkError,
    offline,
    redirect,
    result,
    signInSite,
    type Doc,
} from "./helpers.js";

interface Case {
    name: string;
    run: () => Report | Promise<Report>;
    expect: Status;
    /** For failures: some problem's path or message must match. */
    match?: RegExp;
}

const agentEntry = (extra: Doc = {}) => ({ type: "poppy", endpoint: `https://api.${DOMAIN}/poppy/conversations`, description: "Orders and pickups", ...extra });
const api = (extra: Doc = {}) => ({ type: "openapi", url: `https://api.${DOMAIN}/openapi.json`, description: "Orders", ...extra });
const mediated = (entry: Doc = {}) => ({ "mediated-sign-in": [{ version: "1", fields: [{ name: "email", label: "Email", secret: false }], scopes: ["orders:read"], ...entry }] });
const withAs = (fn: (as: Doc) => void) => {
    const as = goodAs();
    fn(as);
    return { body: as };
};

const CASES: Record<string, Case[]> = {
    // Transport
    "transport.https": [
        { name: "plain HTTPS fetch", run: () => live(base()), expect: "pass" },
        {
            name: "redirect to http://",
            run: () => live(base(), { [WELL_KNOWN]: redirect(`http://${DOMAIN}/.well-known/poppy.json`) }),
            expect: "fail",
            match: /isn't HTTPS/,
        },
    ],
    "transport.status": [
        { name: "200", run: () => live(base()), expect: "pass" },
        { name: "404", run: () => live(base(), { [WELL_KNOWN]: { status: 404, body: "nope" } }), expect: "fail", match: /HTTP 404/ },
        { name: "500", run: () => live(base(), { [WELL_KNOWN]: { status: 500, body: "oops" } }), expect: "fail", match: /HTTP 500/ },
        { name: "DNS failure", run: () => live(base(), { [WELL_KNOWN]: { error: networkError() } }), expect: "fail", match: /ENOTFOUND/ },
        { name: "timeout", run: () => live(base(), { [WELL_KNOWN]: { hang: true } }, { timeoutMs: 20 }), expect: "fail", match: /timed out after 20 ms/ },
    ],
    "transport.final-url": [
        { name: "served at the well-known path", run: () => live(base()), expect: "pass" },
        {
            name: "redirect to another host's well-known path",
            run: () => live(make((d) => (d.organization.domain = "www.fernandfinch.example")), { [WELL_KNOWN]: redirect(`https://www.${DOMAIN}/.well-known/poppy.json`), [`https://www.${DOMAIN}/.well-known/poppy.json`]: { body: make((d) => (d.organization.domain = `www.${DOMAIN}`)) } }),
            expect: "pass",
        },
        {
            name: "redirect to another path",
            run: () => live(base(), { [WELL_KNOWN]: redirect(`https://cdn.${DOMAIN}/poppy.json`), [`https://cdn.${DOMAIN}/poppy.json`]: { body: base() } }),
            expect: "fail",
            match: /\/poppy\.json/,
        },
        {
            name: "redirect adds a query",
            run: () => live(base(), { [WELL_KNOWN]: redirect("/.well-known/poppy.json?v=2"), [`${WELL_KNOWN}?v=2`]: { body: base() } }),
            expect: "fail",
            match: /no query/,
        },
        { name: "no response at all", run: () => live(base(), { [WELL_KNOWN]: { error: networkError() } }), expect: "skip" },
    ],
    "document.json": [
        { name: "a JSON object", run: () => offline(base()), expect: "pass" },
        { name: "invalid JSON", run: () => offline('{ "protocol_version": "1.0", }'), expect: "fail", match: /not valid JSON/ },
        { name: "empty file", run: () => offline(""), expect: "fail", match: /empty/ },
        { name: "top-level array", run: () => offline("[]"), expect: "fail", match: /must be a JSON object, got an array/ },
        { name: "byte order mark", run: () => offline(`﻿${JSON.stringify(base())}`), expect: "fail", match: /byte order mark/ },
        { name: "nothing retrieved (404)", run: () => live(base(), { [WELL_KNOWN]: { status: 404 } }), expect: "skip" },
    ],

    // Document
    "version.present": [
        { name: "present", run: () => offline(base()), expect: "pass" },
        { name: "missing", run: () => offline(make((d) => delete d.protocol_version)), expect: "fail", match: /missing/ },
        { name: "a number", run: () => offline(make((d) => (d.protocol_version = 1.0))), expect: "fail", match: /must be a string, got a number/ },
    ],
    "version.format": [
        { name: "1.0", run: () => offline(base()), expect: "pass" },
        { name: "1.0.0", run: () => offline(make((d) => (d.protocol_version = "1.0.0"))), expect: "fail", match: /isn't major\.minor/ },
        { name: "v1", run: () => offline(make((d) => (d.protocol_version = "v1"))), expect: "fail" },
        { name: "not a string", run: () => offline(make((d) => (d.protocol_version = 1))), expect: "skip" },
    ],
    "version.compatible": [
        { name: "1.0", run: () => offline(base()), expect: "pass" },
        { name: "1.1 (draft minor)", run: () => offline(make((d) => (d.protocol_version = "1.1"))), expect: "pass" },
        {
            name: "0.4 that lists a 1.0 document in supported_versions",
            run: () => offline(make((d) => ((d.protocol_version = "0.4"), (d.supported_versions = { "1.0": `${ORIGIN}/poppy/1.0.json` })))),
            expect: "pass",
        },
        { name: "0.4 (pre-1.0)", run: () => offline(make((d) => (d.protocol_version = "0.4"))), expect: "fail", match: /pre-1\.0/ },
        { name: "2.0 (unknown major)", run: () => offline(make((d) => (d.protocol_version = "2.0"))), expect: "fail", match: /newer major version/ },
        { name: "malformed", run: () => offline(make((d) => (d.protocol_version = "one"))), expect: "skip" },
    ],
    "organization.present": [
        { name: "an object", run: () => offline(base()), expect: "pass" },
        { name: "missing", run: () => offline(make((d) => delete d.organization)), expect: "fail", match: /missing/ },
        { name: "a string", run: () => offline(make((d) => (d.organization = "Fern & Finch"))), expect: "fail", match: /got a string/ },
    ],
    "organization.name": [
        { name: "non-empty", run: () => offline(base()), expect: "pass" },
        { name: "missing", run: () => offline(make((d) => delete d.organization.name)), expect: "fail", match: /missing/ },
        { name: "empty", run: () => offline(make((d) => (d.organization.name = ""))), expect: "fail", match: /empty string/ },
        { name: "no organization", run: () => offline(make((d) => delete d.organization)), expect: "skip" },
    ],
    "organization.domain": [
        { name: "bare host", run: () => offline(base()), expect: "pass" },
        { name: "host with a port", run: () => offline(make((d) => (d.organization.domain = `${DOMAIN}:8443`))), expect: "pass" },
        { name: "missing", run: () => offline(make((d) => delete d.organization.domain)), expect: "fail", match: /missing/ },
        { name: "with scheme", run: () => offline(make((d) => (d.organization.domain = `https://${DOMAIN}/`))), expect: "fail", match: /scheme or path/ },
        { name: "with path", run: () => offline(make((d) => (d.organization.domain = `${DOMAIN}/shop`))), expect: "fail", match: /scheme or path/ },
        { name: "default port", run: () => offline(make((d) => (d.organization.domain = `${DOMAIN}:443`))), expect: "fail", match: /default port/ },
        { name: "single label", run: () => offline(make((d) => (d.organization.domain = "localhost"))), expect: "fail", match: /isn't a valid domain/ },
        { name: "no organization", run: () => offline(make((d) => delete d.organization)), expect: "skip" },
    ],
    "organization.domain-host": [
        { name: "served by the same host", run: () => live(base()), expect: "pass" },
        { name: "case differs", run: () => live(make((d) => (d.organization.domain = "FernAndFinch.example"))), expect: "pass" },
        { name: "served by another host", run: () => live(make((d) => (d.organization.domain = "copycat.example"))), expect: "fail", match: /served by fernandfinch\.example/ },
        { name: "local file", run: () => offline(base()), expect: "skip" },
    ],
    "organization.logo": [
        { name: "https", run: () => offline(make((d) => (d.organization.logo_uri = `${ORIGIN}/logo.png`))), expect: "pass" },
        { name: "http", run: () => offline(make((d) => (d.organization.logo_uri = `http://${DOMAIN}/logo.png`))), expect: "fail", match: /http:\/\// },
        { name: "relative", run: () => offline(make((d) => (d.organization.logo_uri = "/logo.png"))), expect: "fail", match: /absolute HTTPS URL/ },
        { name: "absent", run: () => offline(base()), expect: "skip" },
    ],
    "versions.supported": [
        { name: "same host", run: () => offline(make((d) => (d.supported_versions = { "0.4": `${ORIGIN}/poppy/0.4.json` }))), expect: "pass" },
        { name: "same served host, live", run: () => live(make((d) => (d.supported_versions = { "0.4": `${ORIGIN}/poppy/0.4.json` }))), expect: "pass" },
        { name: "not an object", run: () => offline(make((d) => (d.supported_versions = ["0.4"]))), expect: "fail", match: /must be an object/ },
        { name: "bad key", run: () => offline(make((d) => (d.supported_versions = { "0": `${ORIGIN}/poppy/0.json` }))), expect: "fail", match: /major\.minor/ },
        { name: "lists its own version", run: () => offline(make((d) => (d.supported_versions = { "1.0": `${ORIGIN}/poppy/1.0.json` }))), expect: "fail", match: /own protocol_version/ },
        { name: "http URL", run: () => offline(make((d) => (d.supported_versions = { "0.4": `http://${DOMAIN}/0.4.json` }))), expect: "fail", match: /http:\/\// },
        { name: "another host", run: () => offline(make((d) => (d.supported_versions = { "0.4": "https://cdn.example/0.4.json" }))), expect: "fail", match: /host that served/ },
        { name: "absent", run: () => offline(base()), expect: "skip" },
    ],

    // Channels
    "channels.present": [
        { name: "web", run: () => offline(base()), expect: "pass" },
        { name: "apis only", run: () => offline(make((d) => (delete d.web, (d.apis = [api()])))), expect: "pass" },
        { name: "none", run: () => offline(make((d) => delete d.web)), expect: "fail", match: /no channel/ },
    ],
    "agent.protocols": [
        { name: "complete entry", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry()] }))), expect: "pass" },
        { name: "agent not an object", run: () => offline(make((d) => (d.agent = []))), expect: "fail", match: /must be an object/ },
        { name: "protocols missing", run: () => offline(make((d) => (d.agent = {}))), expect: "fail", match: /missing/ },
        { name: "protocols empty", run: () => offline(make((d) => (d.agent = { protocols: [] }))), expect: "fail", match: /non-empty array/ },
        { name: "entry without description", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry({ description: undefined })] }))), expect: "fail", match: /description/ },
        { name: "http endpoint", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry({ endpoint: `http://api.${DOMAIN}/c` })] }))), expect: "fail", match: /agent\.protocols\[0\]\.endpoint/ },
        { name: "no agent", run: () => offline(base()), expect: "skip" },
    ],
    "agent.known-type": [
        { name: "poppy", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry()] }))), expect: "pass" },
        { name: "ucp", run: () => offline(make((d) => ((d.agent = { protocols: [agentEntry({ type: "ucp", endpoint: `${ORIGIN}/.well-known/ucp` })] }), (d.extensions = { ucp: [{ version: "1" }] })))), expect: "pass" },
        { name: "only unknown types", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry({ type: "a2a" })] }))), expect: "fail", match: /"a2a"/ },
        { name: "no agent", run: () => offline(base()), expect: "skip" },
    ],
    "agent.ucp": [
        { name: "profile URL and extension", run: () => offline(make((d) => ((d.agent = { protocols: [agentEntry({ type: "ucp", endpoint: `${ORIGIN}/.well-known/ucp` })] }), (d.extensions = { ucp: [{ version: "1" }] })))), expect: "pass" },
        { name: "extension missing", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry({ type: "ucp", endpoint: `${ORIGIN}/.well-known/ucp` })] }))), expect: "fail", match: /must list the "ucp" extension/ },
        { name: "endpoint isn't the profile", run: () => offline(make((d) => ((d.agent = { protocols: [agentEntry({ type: "ucp", endpoint: `https://api.${DOMAIN}/ucp/ask` })] }), (d.extensions = { ucp: [{ version: "1" }] })))), expect: "fail", match: /UCP profile/ },
        { name: "no ucp entries", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry()] }))), expect: "skip" },
    ],
    "agent.access": [
        { name: "signed_in", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry({ access: "signed_in" })] }))), expect: "pass" },
        { name: "session", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry({ access: "session" })] }))), expect: "pass" },
        { name: "unknown value", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry({ access: "admin" })] }))), expect: "fail", match: /ignore it/ },
        { name: "on a non-poppy entry", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry({ type: "a2a", access: "session" })] }))), expect: "fail", match: /only for "poppy"/ },
        { name: "no access hints", run: () => offline(make((d) => (d.agent = { protocols: [agentEntry()] }))), expect: "skip" },
    ],
    "apis.entries": [
        { name: "complete entries", run: () => offline(make((d) => (d.apis = [api(), api({ type: "mcp", url: `https://mcp.${DOMAIN}/mcp` })]))), expect: "pass" },
        { name: "not an array", run: () => offline(make((d) => (d.apis = api()))), expect: "fail", match: /must be an array/ },
        { name: "entry not an object", run: () => offline(make((d) => (d.apis = ["openapi"]))), expect: "fail", match: /apis\[0\]/ },
        { name: "url missing", run: () => offline(make((d) => (d.apis = [api({ url: undefined })]))), expect: "fail", match: /apis\[0\]\.url/ },
        { name: "absent", run: () => offline(base()), expect: "skip" },
    ],
    "apis.types": [
        { name: "openapi and mcp", run: () => offline(make((d) => (d.apis = [api(), api({ type: "mcp" })]))), expect: "pass" },
        { name: "wrong case", run: () => offline(make((d) => (d.apis = [api({ type: "OpenAPI" })]))), expect: "fail", match: /"OpenAPI"/ },
        { name: "unknown type", run: () => offline(make((d) => (d.apis = [api({ type: "graphql" })]))), expect: "fail", match: /skip it/ },
        { name: "absent", run: () => offline(base()), expect: "skip" },
    ],
    "web.fields": [
        { name: "empty object", run: () => offline(base()), expect: "pass" },
        { name: "all fields", run: () => offline(make((d) => (d.web = { browser_session_endpoint: `${ORIGIN}/poppy/browser-session`, unscoped: false }))), expect: "pass" },
        { name: "not an object", run: () => offline(make((d) => (d.web = true))), expect: "fail", match: /must be an object/ },
        { name: "disabled as a string", run: () => offline(make((d) => ((d.web = { disabled: "yes" }), (d.apis = [api()])))), expect: "fail", match: /true or false/ },
        { name: "http endpoint", run: () => offline(make((d) => (d.web = { browser_session_endpoint: `http://${DOMAIN}/bs` }))), expect: "fail", match: /browser_session_endpoint/ },
        { name: "absent", run: () => offline(make((d) => (delete d.web, (d.apis = [api()])))), expect: "skip" },
    ],
    "web.disabled": [
        { name: "disabled with apis", run: () => offline(make((d) => ((d.web = { disabled: true }), (d.apis = [api()])))), expect: "pass" },
        { name: "disabled with a browser endpoint", run: () => offline(make((d) => ((d.web = { disabled: true, browser_session_endpoint: `${ORIGIN}/bs` }), (d.apis = [api()])))), expect: "fail", match: /browser_session_endpoint/ },
        { name: "disabled with no other channel", run: () => offline(make((d) => (d.web = { disabled: true }))), expect: "fail", match: /must list agent or apis/ },
        { name: "not disabled", run: () => offline(base()), expect: "skip" },
    ],
    "tasks.endpoint": [
        { name: "https", run: () => offline(make((d) => (d.tasks = { endpoint: `https://api.${DOMAIN}/poppy/tasks` }))), expect: "pass" },
        { name: "not an object", run: () => offline(make((d) => (d.tasks = `https://api.${DOMAIN}/poppy/tasks`))), expect: "fail", match: /must be an object/ },
        { name: "endpoint missing", run: () => offline(make((d) => (d.tasks = {}))), expect: "fail", match: /missing/ },
        { name: "http", run: () => offline(make((d) => (d.tasks = { endpoint: `http://api.${DOMAIN}/tasks` }))), expect: "fail", match: /http:\/\// },
        { name: "absent", run: () => offline(base()), expect: "skip" },
    ],

    // Sign-in
    "auth.fields": [
        { name: "issuer", run: () => offline(make((d) => (d.auth = { issuer: ISSUER, disabled: false }))), expect: "pass" },
        { name: "not an object", run: () => offline(make((d) => (d.auth = ISSUER))), expect: "fail", match: /must be an object/ },
        { name: "http issuer", run: () => offline(make((d) => (d.auth = { issuer: `http://auth.${DOMAIN}` }))), expect: "fail", match: /auth\.issuer/ },
        { name: "disabled as a string", run: () => offline(make((d) => (d.auth = { disabled: "true" }))), expect: "fail", match: /true or false/ },
        { name: "absent", run: () => offline(base()), expect: "skip" },
    ],
    "auth.scopes": [
        { name: "described scopes", run: () => offline(make((d) => (d.auth = { scopes: { "orders:read": "See your orders" } }))), expect: "pass" },
        { name: "an array", run: () => offline(make((d) => (d.auth = { scopes: ["orders:read"] }))), expect: "fail", match: /keyed by scope name/ },
        { name: "empty description", run: () => offline(make((d) => (d.auth = { scopes: { "orders:read": "" } }))), expect: "fail", match: /description/ },
        { name: "space in a name", run: () => offline(make((d) => (d.auth = { scopes: { "orders read": "See your orders" } }))), expect: "fail", match: /valid OAuth scope/ },
        { name: "absent", run: () => offline(base()), expect: "skip" },
    ],
    "auth.scope-hints": [
        { name: "complete hints", run: () => offline(make((d) => (d.auth = { scope_hints: { "orders:read": { changes: "none", personal_data: true } } }))), expect: "pass" },
        { name: "not an object", run: () => offline(make((d) => (d.auth = { scope_hints: [] }))), expect: "fail", match: /keyed by scope name/ },
        { name: "hint not an object", run: () => offline(make((d) => (d.auth = { scope_hints: { "orders:read": "none" } }))), expect: "fail", match: /must be an object/ },
        { name: "unknown changes", run: () => offline(make((d) => (d.auth = { scope_hints: { "orders:read": { changes: "some", personal_data: true } } }))), expect: "fail", match: /changes/ },
        { name: "personal_data missing", run: () => offline(make((d) => (d.auth = { scope_hints: { "orders:read": { changes: "none" } } }))), expect: "fail", match: /personal_data is missing/ },
        { name: "absent", run: () => offline(base()), expect: "skip" },
    ],
    "auth.disabled-conflicts": [
        { name: "disabled alone", run: () => offline(make((d) => (d.auth = { issuer: ISSUER, disabled: true }))), expect: "pass" },
        { name: "with Mediated Sign-In", run: () => offline(make((d) => ((d.auth = { disabled: true }), (d.extensions = mediated())))), expect: "fail", match: /Mediated Sign-In/ },
        { name: "with signed_in access", run: () => offline(make((d) => ((d.auth = { disabled: true }), (d.agent = { protocols: [agentEntry({ access: "signed_in" })] })))), expect: "fail", match: /signed_in/ },
        { name: "not disabled", run: () => offline(base()), expect: "skip" },
    ],

    // Extensions
    "extensions.shape": [
        { name: "entries with versions", run: () => offline(make((d) => (d.extensions = { links: [{ version: "1" }], "fernandfinch.example/cakes": [{ version: "2", endpoint: `${ORIGIN}/cakes` }] }))), expect: "pass" },
        { name: "not an object", run: () => offline(make((d) => (d.extensions = ["links"]))), expect: "fail", match: /keyed by extension name/ },
        { name: "value not a list", run: () => offline(make((d) => (d.extensions = { links: { version: "1" } }))), expect: "fail", match: /non-empty array/ },
        { name: "empty list", run: () => offline(make((d) => (d.extensions = { links: [] }))), expect: "fail", match: /non-empty array/ },
        { name: "numeric version", run: () => offline(make((d) => (d.extensions = { links: [{ version: 1 }] }))), expect: "fail", match: /must be a string, got the number 1/ },
        { name: "http endpoint", run: () => offline(make((d) => (d.extensions = { "fernandfinch.example/cakes": [{ version: "1", endpoint: `http://${DOMAIN}/cakes` }] }))), expect: "fail", match: /endpoint/ },
        { name: "absent", run: () => offline(base()), expect: "skip" },
    ],
    "extensions.names": [
        { name: "defined and domain-named", run: () => offline(make((d) => (d.extensions = { links: [{ version: "1" }], "fernandfinch.example/cakes": [{ version: "1" }] }))), expect: "pass" },
        { name: "unknown plain name", run: () => offline(make((d) => (d.extensions = { "gift-wrap": [{ version: "1" }] }))), expect: "fail", match: /reserved/ },
        { name: "prefix isn't a domain", run: () => offline(make((d) => (d.extensions = { "acme/gift-wrap": [{ version: "1" }] }))), expect: "fail", match: /start with a domain/ },
        { name: "domain with no name", run: () => offline(make((d) => (d.extensions = { "fernandfinch.example/": [{ version: "1" }] }))), expect: "fail", match: /start with a domain/ },
        { name: "no extensions", run: () => offline(base()), expect: "skip" },
    ],
    "extensions.versions": [
        { name: "operations 3", run: () => offline(make((d) => (d.extensions = { operations: [{ version: "3" }] }))), expect: "pass" },
        { name: "an old version alongside the current one", run: () => offline(make((d) => (d.extensions = { operations: [{ version: "3" }, { version: "2" }] }))), expect: "pass" },
        { name: "only an old version", run: () => offline(make((d) => (d.extensions = { operations: [{ version: "2" }] }))), expect: "fail", match: /version "3"/ },
        { name: "only custom extensions", run: () => offline(make((d) => (d.extensions = { "fernandfinch.example/cakes": [{ version: "1" }] }))), expect: "skip" },
    ],
    "operations.browser-join": [
        { name: "endpoint with browser join", run: () => offline(make((d) => ((d.web = { browser_session_endpoint: `${ORIGIN}/bs` }), (d.extensions = { operations: [{ version: "3", endpoint: `${ORIGIN}/ops` }] })))), expect: "pass" },
        { name: "endpoint without browser join", run: () => offline(make((d) => (d.extensions = { operations: [{ version: "3", endpoint: `${ORIGIN}/ops` }] }))), expect: "fail", match: /browser_session_endpoint is required/ },
        { name: "no endpoint", run: () => offline(make((d) => (d.extensions = { operations: [{ version: "3" }] }))), expect: "skip" },
        { name: "operations not listed", run: () => offline(base()), expect: "skip" },
    ],
    "mediated.fields": [
        { name: "fields and scopes", run: () => offline(make((d) => (d.extensions = mediated()))), expect: "pass" },
        { name: "fields missing", run: () => offline(make((d) => (d.extensions = mediated({ fields: undefined })))), expect: "fail", match: /fields is missing/ },
        { name: "reserved field name", run: () => offline(make((d) => (d.extensions = mediated({ fields: [{ name: "client_id", label: "Client", secret: false }] })))), expect: "fail", match: /reserved/ },
        { name: "secret missing", run: () => offline(make((d) => (d.extensions = mediated({ fields: [{ name: "pin", label: "PIN" }] })))), expect: "fail", match: /secret is missing/ },
        { name: "scopes empty", run: () => offline(make((d) => (d.extensions = mediated({ scopes: [] })))), expect: "fail", match: /non-empty array/ },
        { name: "invalid scope", run: () => offline(make((d) => (d.extensions = mediated({ scopes: ["orders read"] })))), expect: "fail", match: /valid scope name/ },
        { name: "not listed", run: () => offline(base()), expect: "skip" },
    ],
    "mediated.transitional": [
        { name: "listed", run: () => offline(make((d) => (d.extensions = mediated()))), expect: "fail", match: /2027-03-17/ },
        { name: "not listed", run: () => offline(base()), expect: "skip" },
        { name: "other extensions only", run: () => offline(make((d) => (d.extensions = { links: [{ version: "1" }] }))), expect: "skip" },
    ],

    // OAuth metadata
    "oauth.resource-metadata": [
        { name: "404: no issuer", run: () => live(base()), expect: "pass" },
        { name: "valid metadata", run: () => signInSite(), expect: "pass" },
        { name: "500", run: () => live(base(), { [PRM_URL]: { status: 500, body: "oops" } }), expect: "fail", match: /HTTP 500/ },
        { name: "not JSON", run: () => live(base(), { [PRM_URL]: { body: "<html>" } }), expect: "fail", match: /isn't a JSON object/ },
        { name: "network error", run: () => live(base(), { [PRM_URL]: { error: networkError("ECONNREFUSED") } }), expect: "fail", match: /ECONNREFUSED/ },
        { name: "--skip-oauth", run: () => live(base(), {}, { skipOAuth: true }), expect: "skip" },
        { name: "local file", run: () => offline(base()), expect: "skip" },
    ],
    "oauth.resource": [
        { name: "exact", run: () => signInSite(), expect: "pass" },
        { name: "host case differs", run: () => signInSite({ prm: { body: { ...goodPrm(), resource: "https://FernAndFinch.example" } } }), expect: "pass" },
        { name: "trailing slash", run: () => signInSite({ prm: { body: { ...goodPrm(), resource: `${ORIGIN}/` } } }), expect: "fail", match: /must be exactly/ },
        { name: "missing", run: () => signInSite({ prm: { body: { authorization_servers: [ISSUER] } } }), expect: "fail", match: /resource is missing/ },
        { name: "no metadata", run: () => live(base()), expect: "skip" },
    ],
    "oauth.issuer": [
        { name: "one server, no auth.issuer", run: () => signInSite(), expect: "pass" },
        { name: "one server, matching auth.issuer", run: () => signInSite({ doc: make((d) => (d.auth = { issuer: ISSUER })) }), expect: "pass" },
        { name: "one server, other auth.issuer", run: () => signInSite({ doc: make((d) => (d.auth = { issuer: "https://login.example" })) }), expect: "fail", match: /only authorization server/ },
        { name: "two servers, no auth.issuer", run: () => signInSite({ prm: { body: { ...goodPrm(), authorization_servers: [ISSUER, "https://staff.example"] } } }), expect: "fail", match: /must say which one/ },
        { name: "two servers, auth.issuer picks one", run: () => signInSite({ doc: make((d) => (d.auth = { issuer: ISSUER })), prm: { body: { ...goodPrm(), authorization_servers: ["https://staff.example", ISSUER] } } }), expect: "pass" },
        { name: "two servers, auth.issuer not listed", run: () => signInSite({ doc: make((d) => (d.auth = { issuer: "https://login.example" })), prm: { body: { ...goodPrm(), authorization_servers: [ISSUER, "https://staff.example"] } } }), expect: "fail", match: /isn't one of/ },
        { name: "404 with auth.issuer", run: () => live(make((d) => (d.auth = { issuer: ISSUER }))), expect: "fail", match: /find no issuer/ },
        { name: "404 with signed_in access", run: () => live(make((d) => (d.agent = { protocols: [agentEntry({ access: "signed_in" })] }))), expect: "fail", match: /signed_in/ },
        { name: "empty list with Mediated Sign-In", run: () => live(make((d) => (d.extensions = mediated())), { [PRM_URL]: { body: { resource: ORIGIN, authorization_servers: [] } } }), expect: "fail", match: /Mediated Sign-In/ },
        { name: "authorization_servers not an array", run: () => signInSite({ prm: { body: { resource: ORIGIN, authorization_servers: ISSUER } } }), expect: "fail", match: /must be an array/ },
        { name: "http issuer listed", run: () => signInSite({ prm: { body: { resource: ORIGIN, authorization_servers: [`http://auth.${DOMAIN}`] } } }), expect: "fail", match: /HTTPS issuer URL/ },
        { name: "unusable metadata", run: () => live(base(), { [PRM_URL]: { status: 503 } }), expect: "skip" },
    ],
    "oauth.server-metadata": [
        { name: "issuer matches", run: () => signInSite(), expect: "pass" },
        { name: "metadata 404", run: () => signInSite({ as: { status: 404 } }), expect: "fail", match: /HTTP 404/ },
        { name: "issuer differs by a trailing slash", run: () => signInSite({ as: withAs((as) => (as.issuer = `${ISSUER}/`)) }), expect: "fail", match: /character for character/ },
        { name: "not JSON", run: () => signInSite({ as: { body: "issuer" } }), expect: "fail", match: /not a JSON object/ },
        { name: "unreachable", run: () => signInSite({ as: { error: networkError() } }), expect: "fail", match: /couldn't fetch/ },
        { name: "no issuer", run: () => live(base()), expect: "skip" },
    ],
    "oauth.protected-resources": [
        { name: "lists the domain", run: () => signInSite(), expect: "pass" },
        { name: "lists it in upper case", run: () => signInSite({ as: withAs((as) => (as.protected_resources = ["https://FERNANDFINCH.example"])) }), expect: "pass" },
        { name: "missing", run: () => signInSite({ as: withAs((as) => delete as.protected_resources) }), expect: "fail", match: /missing/ },
        { name: "doesn't list the domain", run: () => signInSite({ as: withAs((as) => (as.protected_resources = ["https://other.example"])) }), expect: "fail", match: /doesn't list/ },
        { name: "trailing slash", run: () => signInSite({ as: withAs((as) => (as.protected_resources = [`${ORIGIN}/`])) }), expect: "fail", match: /trailing slash/ },
        { name: "no metadata", run: () => live(base()), expect: "skip" },
    ],
    "oauth.endpoints": [
        { name: "complete", run: () => signInSite(), expect: "pass" },
        { name: "token_endpoint missing", run: () => signInSite({ as: withAs((as) => delete as.token_endpoint) }), expect: "fail", match: /token_endpoint/ },
        { name: "revocation_endpoint http", run: () => signInSite({ as: withAs((as) => (as.revocation_endpoint = `http://auth.${DOMAIN}/revoke`)) }), expect: "fail", match: /revocation_endpoint/ },
        { name: "grant_types_supported missing", run: () => signInSite({ as: withAs((as) => delete as.grant_types_supported) }), expect: "fail", match: /grant_types_supported is missing/ },
        { name: "no refresh_token grant", run: () => signInSite({ as: withAs((as) => (as.grant_types_supported = ["authorization_code"])) }), expect: "fail", match: /refresh_token/ },
        { name: "authorization_code without its endpoint", run: () => signInSite({ as: withAs((as) => delete as.authorization_endpoint) }), expect: "fail", match: /authorization_endpoint/ },
        {
            name: "device_code without its endpoint",
            run: () => signInSite({ as: withAs((as) => (as.grant_types_supported = ["refresh_token", "urn:ietf:params:oauth:grant-type:device_code"])) }),
            expect: "fail",
            match: /device_authorization_endpoint/,
        },
        { name: "no metadata", run: () => live(base()), expect: "skip" },
    ],
    "oauth.scopes-supported": [
        { name: "listed by the issuer", run: () => signInSite({ doc: make((d) => (d.auth = { scopes: { "orders:read": "See your orders" } })) }), expect: "pass" },
        {
            name: "listed in protected resource metadata",
            run: () => signInSite({ doc: make((d) => (d.auth = { scopes: { "orders:write": "Change your orders" } })), prm: { body: { ...goodPrm(), scopes_supported: ["orders:write"] } } }),
            expect: "pass",
        },
        { name: "not listed anywhere", run: () => signInSite({ doc: make((d) => (d.auth = { scopes: { "orders:write": "Change your orders" } })) }), expect: "fail", match: /"orders:write"/ },
        { name: "Mediated Sign-In scope not listed", run: () => signInSite({ doc: make((d) => (d.extensions = mediated({ scopes: ["pickups"] }))) }), expect: "fail", match: /"pickups"/ },
        { name: "no scopes named", run: () => signInSite(), expect: "skip" },
        { name: "sign-in disabled", run: () => signInSite({ doc: make((d) => (d.auth = { disabled: true, scopes: { "orders:write": "Change your orders" } })) }), expect: "skip" },
    ],
    "oauth.sign-in-grant": [
        { name: "authorization_code", run: () => signInSite(), expect: "pass" },
        { name: "device_code", run: () => signInSite({ as: withAs((as) => ((as.grant_types_supported = ["refresh_token", "urn:ietf:params:oauth:grant-type:device_code"]), (as.device_authorization_endpoint = `${ISSUER}/device`))) }), expect: "pass" },
        {
            name: "Mediated Sign-In only",
            run: () => signInSite({ doc: make((d) => (d.extensions = mediated())), as: withAs((as) => (as.grant_types_supported = ["refresh_token", "https://personalagentprotocol.org/grant/mediated-sign-in"])) }),
            expect: "pass",
        },
        { name: "refresh_token only", run: () => signInSite({ as: withAs((as) => (as.grant_types_supported = ["refresh_token"])) }), expect: "fail", match: /can't sign Users in/ },
        { name: "sign-in disabled", run: () => signInSite({ doc: make((d) => (d.auth = { disabled: true })), as: withAs((as) => (as.grant_types_supported = ["refresh_token"])) }), expect: "skip" },
    ],
    "oauth.mediated-grant": [
        {
            name: "grant listed",
            run: () => signInSite({ doc: make((d) => (d.extensions = mediated())), as: withAs((as) => as.grant_types_supported.push("https://personalagentprotocol.org/grant/mediated-sign-in")) }),
            expect: "pass",
        },
        { name: "grant missing", run: () => signInSite({ doc: make((d) => (d.extensions = mediated())) }), expect: "fail", match: /grant type/ },
        { name: "not listed", run: () => signInSite(), expect: "skip" },
    ],
};

for (const [id, cases] of Object.entries(CASES)) {
    describe(id, () => {
        for (const c of cases) {
            it(`${c.expect}: ${c.name}`, async () => {
                const r = result(await c.run(), id);
                assert.equal(r.status, c.expect, `${id} was ${r.status}${r.note ? ` (${r.note})` : ""}${r.problems.length ? `: ${JSON.stringify(r.problems)}` : ""}`);
                if (c.expect === "fail") {
                    assert.ok(r.problems.length > 0, "a failure needs at least one problem");
                    for (const p of r.problems) {
                        assert.ok(p.path && p.message && p.fix, `every problem has a path, message, and fix: ${JSON.stringify(p)}`);
                    }
                    if (c.match) {
                        const re = c.match;
                        assert.ok(r.problems.some((p) => re.test(p.message) || re.test(p.path)), `no problem matches ${re}: ${JSON.stringify(r.problems)}`);
                    }
                }
            });
        }
    });
}

/** Rules that only warn when a feature is present, and are otherwise not applicable (skip). */
const WARN_OR_SKIP = new Set(["mediated.transitional"]);

describe("rule coverage", () => {
    it("every rule has a failing case and a passing (or, if it can't pass, skipping) case", () => {
        for (const rule of RULES) {
            const cases = CASES[rule.id];
            assert.ok(cases, `no cases for ${rule.id}`);
            assert.ok(cases.some((c) => c.expect === "fail"), `no failing case for ${rule.id}`);
            const other = WARN_OR_SKIP.has(rule.id) ? "skip" : "pass";
            assert.ok(cases.some((c) => c.expect === other), `no ${other} case for ${rule.id}`);
        }
    });

    it("every case names a real rule", () => {
        const ids = new Set(RULES.map((rule) => rule.id));
        for (const id of Object.keys(CASES)) assert.ok(ids.has(id), `cases for unknown rule ${id}`);
    });

    it("rule ids are unique and every rule links to the spec", () => {
        const ids = RULES.map((rule) => rule.id);
        assert.equal(new Set(ids).size, ids.length);
        for (const rule of RULES) assert.match(rule.specUrl, /^https:\/\/personalagentprotocol\.org\/docs\//);
    });
});

// Sanity: the helpers' sign-in site really is a fully passing configuration.
describe("signInSite baseline", () => {
    it("passes every rule that applies", async () => {
        const report = await signInSite({ doc: make((d) => (d.auth = { issuer: ISSUER, scopes: { "orders:read": "See your orders" } })) });
        assert.deepEqual(
            report.results.filter((r) => r.status === "fail").map((r) => r.id),
            [],
        );
        assert.equal(report.score, 100);
        assert.equal(report.final_url, WELL_KNOWN);
        assert.ok(report.results.some((r) => r.id === "oauth.server-metadata" && r.status === "pass"));
    });
});
