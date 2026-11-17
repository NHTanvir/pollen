// Section 3.3, and what the Operations and Mediated Sign-In extensions require of poppy.json.

import { DEFINED_EXTENSIONS, MEDIATED_SIGN_IN, MEDIATED_SIGN_IN_REMOVAL, RESERVED_FIELD_NAMES } from "../spec.js";
import { Problems, SCOPE_TOKEN, describe, isDomain, isObject, show } from "../util.js";
import { defineRule, docOf, fail, pass, skip } from "./define.js";

export const extensionsShape = defineRule(
    {
        id: "extensions.shape",
        title: "extensions are lists of entries with a version",
        group: "Extensions",
        stage: "document",
        severity: "error",
        section: "3.3",
    },
    (ctx) => {
        const extensions = docOf(ctx).extensions;
        if (extensions === undefined) return skip("No extensions (optional).");
        if (!isObject(extensions)) {
            return fail("extensions", `must be an object keyed by extension name, got ${describe(extensions)}`, 'Use { "operations": [ { "version": "3" } ] }.');
        }
        const problems = new Problems();
        for (const [name, entries] of Object.entries(extensions)) {
            const path = `extensions["${name}"]`;
            if (!Array.isArray(entries) || entries.length === 0) {
                problems.add(path, `must be a non-empty array with an entry per major version, got ${describe(entries)}`, 'Wrap the entry in a list: [ { "version": "1" } ].');
                continue;
            }
            entries.forEach((entry, i) => {
                if (!isObject(entry)) {
                    problems.add(`${path}[${i}]`, `must be an object, got ${describe(entry)}`, 'Use { "version": "1" }.');
                    return;
                }
                if (typeof entry.version === "number") {
                    problems.add(`${path}[${i}].version`, `version must be a string, got the number ${entry.version}`, `Write it with quotes: "${entry.version}".`);
                } else {
                    problems.text(`${path}[${i}].version`, entry.version, "version", "Set version to the extension's major version as a string, such as \"1\".");
                }
                if (entry.endpoint !== undefined) problems.https(`${path}[${i}].endpoint`, entry.endpoint, "endpoint");
            });
        }
        return problems.outcome;
    },
);

export const extensionsNames = defineRule(
    {
        id: "extensions.names",
        title: "extension names are defined or start with a domain",
        group: "Extensions",
        stage: "document",
        severity: "warning",
        section: "3.3",
    },
    (ctx) => {
        const extensions = docOf(ctx).extensions;
        if (!isObject(extensions)) return skip("No extensions object.");
        const problems = new Problems();
        const defined = Object.keys(DEFINED_EXTENSIONS).join(", ");
        for (const name of Object.keys(extensions)) {
            const path = `extensions["${name}"]`;
            const slash = name.indexOf("/");
            if (slash === -1) {
                if (DEFINED_EXTENSIONS[name] === undefined) {
                    problems.add(path, `${show(name)} isn't an extension defined with the protocol (${defined}); plain names are reserved for those`, `Rename it to start with a domain you control, such as "example.com/${name}".`);
                }
            } else if (!isDomain(name.slice(0, slash)) || slash === name.length - 1) {
                problems.add(path, `${show(name)} doesn't start with a domain followed by a name`, 'Use a name such as "example.com/gift-wrap".');
            }
        }
        return problems.outcome;
    },
);

export const extensionsVersions = defineRule(
    {
        id: "extensions.versions",
        title: "defined extensions include their 1.0 version",
        group: "Extensions",
        stage: "document",
        severity: "warning",
        section: "Extensions index",
    },
    (ctx) => {
        const extensions = docOf(ctx).extensions;
        if (!isObject(extensions)) return skip("No extensions object.");
        const problems = new Problems();
        let seen = false;
        for (const [name, current] of Object.entries(DEFINED_EXTENSIONS)) {
            const entries = extensions[name];
            if (!Array.isArray(entries)) continue;
            const versions = entries.flatMap((entry) => (isObject(entry) && typeof entry.version === "string" ? [entry.version] : []));
            if (versions.length === 0) continue; // extensions.shape reports this
            seen = true;
            if (!versions.includes(current)) {
                problems.add(
                    `extensions["${name}"]`,
                    `lists version ${versions.map(show).join(", ")}, but Poppy 1.0 defines ${name} version "${current}", and an extension is used only at a version both sides support`,
                    `Add an entry with "version": "${current}" (keep older entries while Personal Agents move over).`,
                );
            }
        }
        if (!seen) return skip("No extensions defined with the protocol.");
        return problems.outcome;
    },
);

export const operationsBrowserJoin = defineRule(
    {
        id: "operations.browser-join",
        title: "an operations endpoint comes with web.browser_session_endpoint",
        group: "Extensions",
        stage: "document",
        severity: "error",
        section: "Operations 2",
    },
    (ctx) => {
        const doc = docOf(ctx);
        const entries = isObject(doc.extensions) ? doc.extensions.operations : undefined;
        if (!Array.isArray(entries)) return skip("operations isn't listed.");
        const i = entries.findIndex((entry) => isObject(entry) && entry.endpoint !== undefined);
        if (i === -1) return skip("No operations endpoint: the website handles approval itself.");
        if (isObject(doc.web) && doc.web.browser_session_endpoint !== undefined) return pass;
        return fail(
            `extensions["operations"][${i}].endpoint`,
            "an operations endpoint means your website returns operations, and only a browser joined to a Session gets them, so web.browser_session_endpoint is required",
            "Add web.browser_session_endpoint, or remove the operations endpoint if your website handles approval itself.",
        );
    },
);

export const mediatedSignIn = defineRule(
    {
        id: "mediated.fields",
        title: "mediated-sign-in v1 lists fields and scopes",
        group: "Extensions",
        stage: "document",
        severity: "error",
        section: "Mediated Sign-In 2",
    },
    (ctx) => {
        const extensions = docOf(ctx).extensions;
        if (!isObject(extensions) || extensions[MEDIATED_SIGN_IN] === undefined) return skip("Mediated Sign-In isn't listed.");
        const entries = extensions[MEDIATED_SIGN_IN];
        if (!Array.isArray(entries)) return skip("Not a list; see extensions.shape.");
        const problems = new Problems();
        const reserved = RESERVED_FIELD_NAMES as readonly string[];
        entries.forEach((entry, i) => {
            if (!isObject(entry) || entry.version !== "1") return;
            const path = `extensions["${MEDIATED_SIGN_IN}"][${i}]`;
            const fields = entry.fields;
            if (!Array.isArray(fields) || fields.length === 0) {
                problems.add(`${path}.fields`, fields === undefined ? "fields is missing" : `must be a non-empty array, got ${describe(fields)}`, 'List the credentials to collect: [ { "name": "username", "label": "Email", "secret": false } ].');
            } else {
                fields.forEach((field, j) => {
                    const fpath = `${path}.fields[${j}]`;
                    if (!isObject(field)) {
                        problems.add(fpath, `must be an object, got ${describe(field)}`, "Use { name, label, secret }.");
                        return;
                    }
                    if (problems.text(`${fpath}.name`, field.name, "name", "Set name to the token request parameter for this credential, such as \"password\".") && reserved.includes(field.name as string)) {
                        problems.add(`${fpath}.name`, `${show(field.name)} is a reserved token request parameter`, "Pick another name, such as \"account_password\".");
                    }
                    problems.text(`${fpath}.label`, field.label, "label", "Set label to what the User sees, such as \"Password\".");
                    if (typeof field.secret !== "boolean") {
                        problems.add(`${fpath}.secret`, field.secret === undefined ? "secret is missing" : `must be true or false, got ${describe(field.secret)}`, "Set secret to true for passwords and codes, false otherwise.");
                    }
                });
            }
            const scopes = entry.scopes;
            if (!Array.isArray(scopes) || scopes.length === 0) {
                problems.add(`${path}.scopes`, scopes === undefined ? "scopes is missing" : `must be a non-empty array, got ${describe(scopes)}`, 'List the scopes this sign-in can grant, such as [ "orders:read" ].');
            } else {
                scopes.forEach((scope, j) => {
                    if (typeof scope !== "string" || !SCOPE_TOKEN.test(scope)) {
                        problems.add(`${path}.scopes[${j}]`, `${show(scope)} isn't a valid scope name`, "Use scope names without spaces, such as orders:read.");
                    }
                });
            }
        });
        return problems.outcome;
    },
);

export const mediatedSignInTransitional = defineRule(
    {
        id: "mediated.transitional",
        title: "Doesn't depend on Mediated Sign-In, which is being removed",
        group: "Extensions",
        stage: "document",
        severity: "warning",
        section: "Roadmap",
    },
    (ctx) => {
        const extensions = docOf(ctx).extensions;
        if (!isObject(extensions) || extensions[MEDIATED_SIGN_IN] === undefined) return skip("Mediated Sign-In isn't listed.");
        return fail(
            `extensions["${MEDIATED_SIGN_IN}"]`,
            `Mediated Sign-In is transitional: Personal Agents handle the User's credentials, and the roadmap plans to remove it on ${MEDIATED_SIGN_IN_REMOVAL}`,
            "Offer Direct Sign-In (authorization_code at your issuer), the preferred sign-in type, and keep Mediated Sign-In only while you migrate.",
        );
    },
);

export const extensionRules = [extensionsShape, extensionsNames, extensionsVersions, operationsBrowserJoin, mediatedSignIn, mediatedSignInTransitional];
