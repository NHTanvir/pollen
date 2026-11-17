// Sections 3.1, 3.2 and 4.7: the auth object.

import { MEDIATED_SIGN_IN, SCOPE_CHANGES } from "../spec.js";
import { Problems, SCOPE_TOKEN, describe, isObject, show } from "../util.js";
import { defineRule, docOf, fail, skip } from "./define.js";

export const authFields = defineRule(
    {
        id: "auth.fields",
        title: "auth.issuer is HTTPS and auth.disabled is a boolean",
        group: "Sign-in",
        stage: "document",
        severity: "error",
        section: "3.1",
    },
    (ctx) => {
        const auth = docOf(ctx).auth;
        if (auth === undefined) return skip("No auth (optional): the Company offers no sign-in, or relies on its OAuth metadata alone.");
        if (!isObject(auth)) return fail("auth", `must be an object, got ${describe(auth)}`, 'Use { "issuer": "https://auth.example.com" }, or remove auth.');
        const problems = new Problems();
        if (auth.issuer !== undefined) problems.https("auth.issuer", auth.issuer, "issuer");
        problems.optionalBoolean("auth.disabled", auth.disabled);
        return problems.outcome;
    },
);

export const authScopes = defineRule(
    {
        id: "auth.scopes",
        title: "auth.scopes maps scope names to descriptions",
        group: "Sign-in",
        stage: "document",
        severity: "error",
        section: "4.7",
    },
    (ctx) => {
        const auth = docOf(ctx).auth;
        if (!isObject(auth) || auth.scopes === undefined) return skip("No auth.scopes (optional).");
        const scopes = auth.scopes;
        if (!isObject(scopes)) {
            return fail("auth.scopes", `must be an object keyed by scope name, got ${describe(scopes)}`, 'Use { "orders:read": "See your orders" }.');
        }
        const problems = new Problems();
        for (const [name, description] of Object.entries(scopes)) {
            const path = `auth.scopes["${name}"]`;
            if (!SCOPE_TOKEN.test(name)) {
                problems.add(path, `${show(name)} isn't a valid OAuth scope name (no spaces, quotes, or backslashes)`, "Rename the scope, such as orders:read.");
            }
            problems.text(path, description, "the description", "Describe what the scope lets an agent see or do, in a sentence a User can read.");
        }
        return problems.outcome;
    },
);

export const authScopeHints = defineRule(
    {
        id: "auth.scope-hints",
        title: "auth.scope_hints have changes and personal_data",
        group: "Sign-in",
        stage: "document",
        severity: "error",
        section: "4.7",
    },
    (ctx) => {
        const auth = docOf(ctx).auth;
        if (!isObject(auth) || auth.scope_hints === undefined) return skip("No auth.scope_hints (optional).");
        const hints = auth.scope_hints;
        if (!isObject(hints)) {
            return fail("auth.scope_hints", `must be an object keyed by scope name, got ${describe(hints)}`, 'Use { "orders:read": { "changes": "none", "personal_data": true } }.');
        }
        const problems = new Problems();
        const changes = SCOPE_CHANGES.map((c) => `"${c}"`).join(", ");
        for (const [name, hint] of Object.entries(hints)) {
            const path = `auth.scope_hints["${name}"]`;
            if (!isObject(hint)) {
                problems.add(path, `must be an object, got ${describe(hint)}`, 'Use { "changes": "none", "personal_data": true }.');
                continue;
            }
            if (!SCOPE_CHANGES.includes(hint.changes as never)) {
                problems.add(
                    `${path}.changes`,
                    hint.changes === undefined ? "changes is missing" : `${show(hint.changes)} isn't one of ${changes}`,
                    `Set changes to one of ${changes}, for the most consequential operation the scope allows.`,
                );
            }
            if (typeof hint.personal_data !== "boolean") {
                problems.add(
                    `${path}.personal_data`,
                    hint.personal_data === undefined ? "personal_data is missing" : `must be true or false, got ${describe(hint.personal_data)}`,
                    "Set personal_data to true if the scope exposes the User's personal data, otherwise false.",
                );
            }
        }
        return problems.outcome;
    },
);

/** Entries in agent.protocols with access "signed_in", as paths. */
export function signedInPaths(doc: Record<string, unknown>): string[] {
    const agent = doc.agent;
    if (!isObject(agent) || !Array.isArray(agent.protocols)) return [];
    return agent.protocols.flatMap((entry, i) => (isObject(entry) && entry.type === "poppy" && entry.access === "signed_in" ? [`agent.protocols[${i}].access`] : []));
}

export function listsMediatedSignIn(doc: Record<string, unknown>): boolean {
    return isObject(doc.extensions) && doc.extensions[MEDIATED_SIGN_IN] !== undefined;
}

export const authDisabledConflicts = defineRule(
    {
        id: "auth.disabled-conflicts",
        title: "auth.disabled doesn't advertise sign-in anywhere else",
        group: "Sign-in",
        stage: "document",
        severity: "error",
        section: "3.2",
    },
    (ctx) => {
        const doc = docOf(ctx);
        if (!isObject(doc.auth) || doc.auth.disabled !== true) return skip("auth.disabled isn't set.");
        const problems = new Problems();
        if (listsMediatedSignIn(doc)) {
            problems.add(`extensions["${MEDIATED_SIGN_IN}"]`, "a Company that sets auth.disabled must not list the Mediated Sign-In extension", "Remove the extension, or turn sign-in on by removing auth.disabled.");
        }
        for (const path of signedInPaths(doc)) {
            problems.add(path, 'a Company that sets auth.disabled must not list "signed_in" access', 'Use "session", or remove auth.disabled.');
        }
        return problems.outcome;
    },
);

export const authRules = [authFields, authScopes, authScopeHints, authDisabledConflicts];
