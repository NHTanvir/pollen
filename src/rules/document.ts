// Section 3.1 and 3.4: protocol_version, organization, and supported_versions.

import { CHANGELOG_URL, SPEC_VERSION } from "../spec.js";
import { Problems, VERSION_PATTERN, describe, hostOf, isDomain, isHttpsUrl, isObject, majorOf, show } from "../util.js";
import { VERSION } from "../version.js";
import { defineRule, docOf, fail, pass, skip } from "./define.js";

export const versionPresent = defineRule(
    {
        id: "version.present",
        title: "protocol_version is present and a string",
        group: "Document",
        stage: "document",
        severity: "error",
        section: "3.1",
        allVersions: true,
    },
    (ctx) => {
        const value = docOf(ctx).protocol_version;
        if (value === undefined) {
            return fail("protocol_version", "protocol_version is missing, and it is required", `Add "protocol_version": "${SPEC_VERSION}" at the top level.`);
        }
        if (typeof value !== "string") {
            const fix = typeof value === "number" ? `Write it as a string, with quotes: "${SPEC_VERSION}".` : `Set it to the string "${SPEC_VERSION}".`;
            return fail("protocol_version", `must be a string, got ${describe(value)} ${show(value)}`, fix);
        }
        return pass;
    },
);

export const versionFormat = defineRule(
    {
        id: "version.format",
        title: "protocol_version is major.minor",
        group: "Document",
        stage: "document",
        severity: "error",
        section: "3.1",
        allVersions: true,
    },
    (ctx) => {
        const value = docOf(ctx).protocol_version;
        if (typeof value !== "string") return skip("protocol_version isn't a string; see version.present.");
        if (VERSION_PATTERN.test(value)) return pass;
        const match = /^v?([0-9]+)\.([0-9]+)(\.[0-9]+)?$/.exec(value);
        const fix = match ? `Use "${match[1]}.${match[2]}".` : `Use the form major.minor, such as "${SPEC_VERSION}".`;
        return fail("protocol_version", `${show(value)} isn't major.minor`, fix);
    },
);

export const versionCompatible = defineRule(
    {
        id: "version.compatible",
        title: "protocol_version is compatible with 1.0",
        group: "Document",
        stage: "document",
        severity: "error",
        section: "3.4",
        allVersions: true,
    },
    (ctx) => {
        const doc = docOf(ctx);
        const value = doc.protocol_version;
        const major = majorOf(value);
        if (major === undefined) return skip("protocol_version isn't valid; see version.format.");
        if (major === 1) return pass;
        // A 1.0 Personal Agent uses a 1.x document that supported_versions lists instead (spec 3.4).
        const versions = doc.supported_versions;
        if (isObject(versions) && Object.entries(versions).some(([v, url]) => majorOf(v) === 1 && isHttpsUrl(url))) return pass;
        if (major === 0) {
            return fail(
                "protocol_version",
                `${value} is a pre-1.0 draft. Before 1.0, a version is compatible only with the same minor version, so a Personal Agent that implements only ${SPEC_VERSION} must not use this document. Pollen checks ${SPEC_VERSION} documents, so it skipped the field rules`,
                `Publish a ${SPEC_VERSION} document: set protocol_version to "${SPEC_VERSION}" and apply the changes since ${value} in the changelog (${CHANGELOG_URL}). To keep serving ${value} as well, move it to another URL and list it in supported_versions. If your platform generates poppy.json for you, it has to make this change.`,
            );
        }
        return fail(
            "protocol_version",
            `${value} is a newer major version than ${SPEC_VERSION}, and Pollen ${VERSION} checks only 1.x documents, so it skipped the field rules`,
            `Check the version, or use a Pollen release that supports ${major}.x.`,
        );
    },
);

export const organizationPresent = defineRule(
    {
        id: "organization.present",
        title: "organization is present and an object",
        group: "Document",
        stage: "document",
        severity: "error",
        section: "3.1",
    },
    (ctx) => {
        const org = docOf(ctx).organization;
        if (org === undefined) {
            return fail("organization", "organization is missing, and it is required", 'Add "organization": { "name": "Your Company", "domain": "example.com" }.');
        }
        if (!isObject(org)) {
            return fail("organization", `must be an object, got ${describe(org)}`, 'Use an object: { "name": "Your Company", "domain": "example.com" }.');
        }
        return pass;
    },
);

export const organizationName = defineRule(
    {
        id: "organization.name",
        title: "organization.name is a non-empty string",
        group: "Document",
        stage: "document",
        severity: "error",
        section: "3.1",
    },
    (ctx) => {
        const org = docOf(ctx).organization;
        if (!isObject(org)) return skip("No organization object; see organization.present.");
        const problems = new Problems();
        problems.text("organization.name", org.name, "organization.name", "Set it to the Company's display name, such as \"Example Company\".");
        return problems.outcome;
    },
);

export const organizationDomain = defineRule(
    {
        id: "organization.domain",
        title: "organization.domain is a bare host name",
        group: "Document",
        stage: "document",
        severity: "error",
        section: "3.1",
    },
    (ctx) => {
        const org = docOf(ctx).organization;
        if (!isObject(org)) return skip("No organization object; see organization.present.");
        const domain = org.domain;
        if (domain === undefined) {
            return fail("organization.domain", "organization.domain is missing, and it is required", 'Set it to the host that serves poppy.json, such as "example.com".');
        }
        if (typeof domain !== "string") {
            return fail("organization.domain", `must be a string, got ${describe(domain)}`, 'Set it to the host that serves poppy.json, such as "example.com".');
        }
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(domain) || domain.includes("/")) {
            const host = hostOf(/^[a-z][a-z0-9+.-]*:\/\//i.test(domain) ? domain : `https://${domain}`);
            return fail(
                "organization.domain",
                `${show(domain)} has a scheme or path, but must be a host name only`,
                host ? `Use "${host}".` : "Remove the scheme and path, leaving only the host name.",
            );
        }
        if (/:443$/.test(domain)) {
            return fail("organization.domain", `${show(domain)} includes the default port, which Personal Agents won't match`, `Use "${domain.replace(/:443$/, "")}". Include a port only when it isn't 443.`);
        }
        if (!isDomain(domain)) {
            return fail("organization.domain", `${show(domain)} isn't a valid domain name`, 'Use a fully qualified host name, such as "example.com" or "shop.example.com".');
        }
        return pass;
    },
);

export const organizationDomainHost = defineRule(
    {
        id: "organization.domain-host",
        title: "organization.domain matches the host that served it",
        group: "Document",
        stage: "document",
        severity: "error",
        section: "3",
    },
    (ctx) => {
        if (ctx.mode !== "url" || !ctx.servedHost) return skip("Local file: there's no serving host to compare. Check the live URL to run this rule.");
        const org = docOf(ctx).organization;
        if (!isObject(org) || !isDomain(org.domain)) return skip("organization.domain isn't valid; see organization.domain.");
        if (org.domain.toLowerCase() === ctx.servedHost) return pass;
        return fail(
            "organization.domain",
            `the document says ${show(org.domain)} but was served by ${ctx.servedHost}, so Personal Agents won't use it (this stops a copied document from speaking for a Company)`,
            `Set organization.domain to "${ctx.servedHost}", or serve the document from ${org.domain}.`,
        );
    },
);

export const organizationLogo = defineRule(
    {
        id: "organization.logo",
        title: "organization.logo_uri is an HTTPS URL",
        group: "Document",
        stage: "document",
        severity: "error",
        section: "3.1",
    },
    (ctx) => {
        const org = docOf(ctx).organization;
        if (!isObject(org)) return skip("No organization object; see organization.present.");
        if (org.logo_uri === undefined) return skip("No logo_uri (optional).");
        const problems = new Problems();
        problems.https("organization.logo_uri", org.logo_uri, "logo_uri");
        return problems.outcome;
    },
);

export const supportedVersions = defineRule(
    {
        id: "versions.supported",
        title: "supported_versions maps other versions to HTTPS URLs on this host",
        group: "Document",
        stage: "document",
        severity: "error",
        section: "3.4",
        allVersions: true,
    },
    (ctx) => {
        const doc = docOf(ctx);
        const versions = doc.supported_versions;
        if (versions === undefined) return skip("No supported_versions (optional).");
        if (!isObject(versions)) {
            return fail("supported_versions", `must be an object mapping versions to URLs, got ${describe(versions)}`, 'Use { "0.4": "https://example.com/poppy/0.4.json" }, or remove it.');
        }
        const org = doc.organization;
        const host = ctx.servedHost ?? (isObject(org) && isDomain(org.domain) ? org.domain.toLowerCase() : undefined);
        const problems = new Problems();
        for (const [version, url] of Object.entries(versions)) {
            const path = `supported_versions["${version}"]`;
            if (!VERSION_PATTERN.test(version)) {
                problems.add(path, `key ${show(version)} isn't a major.minor version`, 'Use keys such as "0.4".');
            }
            if (version === doc.protocol_version) {
                problems.add(path, `${version} is this document's own protocol_version; supported_versions lists the other versions`, `Remove the "${version}" entry.`);
            }
            if (!problems.https(path, url, "the version's URL")) continue;
            const urlHost = hostOf(url);
            if (host && urlHost !== host) {
                problems.add(path, `${show(url)} is on ${urlHost}, but must be on the host that served poppy.json (${host}); Personal Agents won't follow it`, `Host the ${version} document on ${host}.`);
            }
        }
        return problems.outcome;
    },
);

export const documentRules = [
    versionPresent,
    versionFormat,
    versionCompatible,
    organizationPresent,
    organizationName,
    organizationDomain,
    organizationDomainHost,
    organizationLogo,
    supportedVersions,
];
