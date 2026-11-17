// Sections 3.1, 6, 7, 8.1 and 9, and UCP 5: the channels a Company offers (agent, apis, web) and tasks.

import { ACCESS_VALUES, API_TYPES, CONVERSATION_TYPES, UCP_PROFILE_PATH } from "../spec.js";
import { Problems, describe, isDomain, isHttpsUrl, isObject, show } from "../util.js";
import { defineRule, docOf, fail, pass, skip } from "./define.js";

export const channelsPresent = defineRule(
    {
        id: "channels.present",
        title: "Lists at least one channel: agent, apis, or web",
        group: "Channels",
        stage: "document",
        severity: "error",
        section: "3.1",
    },
    (ctx) => {
        const doc = docOf(ctx);
        if (doc.agent !== undefined || doc.apis !== undefined || doc.web !== undefined) return pass;
        return fail(
            "$",
            "no channel is listed, so a Personal Agent has no way to work with the Company",
            'Add at least one of "web" (even {} lets agents browse as signed-out visitors), "apis" (OpenAPI or MCP), or "agent" (your Company Agent).',
        );
    },
);

export const agentProtocols = defineRule(
    {
        id: "agent.protocols",
        title: "agent.protocols entries have type, HTTPS endpoint, and description",
        group: "Channels",
        stage: "document",
        severity: "error",
        section: "8.1",
    },
    (ctx) => {
        const agent = docOf(ctx).agent;
        if (agent === undefined) return skip("No agent (optional).");
        if (!isObject(agent)) return fail("agent", `must be an object, got ${describe(agent)}`, 'Use { "protocols": [ ... ] }.');
        const protocols = agent.protocols;
        if (!Array.isArray(protocols) || protocols.length === 0) {
            return fail(
                "agent.protocols",
                protocols === undefined ? "agent.protocols is missing" : `must be a non-empty array, got ${describe(protocols)}`,
                'Add { "type": "poppy", "endpoint": "https://...", "description": "What your agent can help with" }, or remove agent.',
            );
        }
        const problems = new Problems();
        protocols.forEach((entry, i) => {
            const path = `agent.protocols[${i}]`;
            if (!isObject(entry)) {
                problems.add(path, `must be an object, got ${describe(entry)}`, "Use an object with type, endpoint, and description.");
                return;
            }
            problems.text(`${path}.type`, entry.type, "type", 'Set it to "poppy", the conversation protocol the spec defines.');
            problems.https(`${path}.endpoint`, entry.endpoint, "endpoint");
            problems.text(`${path}.description`, entry.description, "description", "Say in plain language what the agent at this endpoint can help with. It may say anything.");
        });
        return problems.outcome;
    },
);

export const agentKnownType = defineRule(
    {
        id: "agent.known-type",
        title: 'agent.protocols has a "poppy" or "ucp" entry',
        group: "Channels",
        stage: "document",
        severity: "warning",
        section: "8.1",
    },
    (ctx) => {
        const agent = docOf(ctx).agent;
        if (!isObject(agent) || !Array.isArray(agent.protocols)) return skip("No agent.protocols list.");
        if (agent.protocols.some((entry) => isObject(entry) && CONVERSATION_TYPES.includes(entry.type as never))) return pass;
        const types = agent.protocols.map((entry) => (isObject(entry) ? show(entry.type) : "?")).join(", ");
        return fail(
            "agent.protocols",
            `no entry has a conversation type Personal Agents know (${types}). They skip unfamiliar types, so none will reach your Company Agent`,
            'Use "type": "poppy", the conversation protocol in spec section 8, or "ucp" for UCP Ask with the UCP extension.',
        );
    },
);

export const agentUcp = defineRule(
    {
        id: "agent.ucp",
        title: 'ucp entries point at the UCP profile and list the "ucp" extension',
        group: "Channels",
        stage: "document",
        severity: "error",
        section: "UCP 5",
    },
    (ctx) => {
        const doc = docOf(ctx);
        const agent = doc.agent;
        if (!isObject(agent) || !Array.isArray(agent.protocols)) return skip("No agent.protocols list.");
        const entries = agent.protocols.map((entry, i) => [entry, i] as const).filter(([entry]) => isObject(entry) && entry.type === "ucp");
        if (entries.length === 0) return skip('No "ucp" entries.');
        const problems = new Problems();
        if (!isObject(doc.extensions) || doc.extensions.ucp === undefined) {
            problems.add("extensions", 'a Company that lists a "ucp" conversation entry must list the "ucp" extension', 'Add "ucp": [ { "version": "1" } ] to extensions.');
        }
        const org = doc.organization;
        const domain = isObject(org) && isDomain(org.domain) ? org.domain.toLowerCase() : undefined;
        for (const [entry, i] of entries) {
            const endpoint = (entry as Record<string, unknown>).endpoint;
            if (!domain || !isHttpsUrl(endpoint)) continue; // agent.protocols and organization.domain report these
            const url = new URL(endpoint);
            if (url.host.toLowerCase() !== domain || url.pathname !== UCP_PROFILE_PATH || url.search !== "") {
                problems.add(
                    `agent.protocols[${i}].endpoint`,
                    `a "ucp" entry's endpoint is the Company's UCP profile, https://${domain}${UCP_PROFILE_PATH}, not ${show(endpoint)}`,
                    `Set it to "https://${domain}${UCP_PROFILE_PATH}". Personal Agents find Ask's own endpoint from the profile.`,
                );
            }
        }
        return problems.outcome;
    },
);

export const agentAccess = defineRule(
    {
        id: "agent.access",
        title: 'access hints are "session" or "signed_in"',
        group: "Channels",
        stage: "document",
        severity: "warning",
        section: "3.2",
    },
    (ctx) => {
        const agent = docOf(ctx).agent;
        if (!isObject(agent) || !Array.isArray(agent.protocols)) return skip("No agent.protocols list.");
        const problems = new Problems();
        let seen = false;
        agent.protocols.forEach((entry, i) => {
            if (!isObject(entry) || entry.access === undefined) return;
            seen = true;
            if (entry.type !== "poppy") {
                problems.add(`agent.protocols[${i}].access`, `access is defined only for "poppy" entries, and this one is ${show(entry.type)}`, "Remove access from this entry.");
            } else if (!ACCESS_VALUES.includes(entry.access as never)) {
                problems.add(`agent.protocols[${i}].access`, `${show(entry.access)} isn't a known value, so Personal Agents ignore it`, 'Use "session" (the default) or "signed_in".');
            }
        });
        if (!seen) return skip("No access hints (optional).");
        return problems.outcome;
    },
);

export const apisEntries = defineRule(
    {
        id: "apis.entries",
        title: "apis entries have type, HTTPS url, and description",
        group: "Channels",
        stage: "document",
        severity: "error",
        section: "7",
    },
    (ctx) => {
        const apis = docOf(ctx).apis;
        if (apis === undefined) return skip("No apis (optional).");
        if (!Array.isArray(apis)) {
            return fail("apis", `must be an array, got ${describe(apis)}`, 'Use [ { "type": "openapi", "url": "https://...", "description": "..." } ].');
        }
        const problems = new Problems();
        apis.forEach((entry, i) => {
            const path = `apis[${i}]`;
            if (!isObject(entry)) {
                problems.add(path, `must be an object, got ${describe(entry)}`, "Use an object with type, url, and description.");
                return;
            }
            problems.text(`${path}.type`, entry.type, "type", 'Set it to "openapi" or "mcp".');
            problems.https(`${path}.url`, entry.url, "url");
            problems.text(`${path}.description`, entry.description, "description", "Add a short description that helps a Personal Agent pick the right API.");
        });
        return problems.outcome;
    },
);

export const apisTypes = defineRule(
    {
        id: "apis.types",
        title: 'apis types are "openapi" or "mcp"',
        group: "Channels",
        stage: "document",
        severity: "warning",
        section: "7",
    },
    (ctx) => {
        const apis = docOf(ctx).apis;
        if (!Array.isArray(apis)) return skip("No apis list.");
        const problems = new Problems();
        apis.forEach((entry, i) => {
            if (!isObject(entry) || typeof entry.type !== "string" || entry.type === "") return;
            if (API_TYPES.includes(entry.type as never)) return;
            const lower = entry.type.toLowerCase();
            const fix = API_TYPES.includes(lower as never) ? `Use lowercase "${lower}".` : 'Use "openapi" or "mcp", or expect Personal Agents to skip this API.';
            problems.add(`apis[${i}].type`, `${show(entry.type)} isn't an API type this version defines, so Personal Agents skip it`, fix);
        });
        return problems.outcome;
    },
);

export const webFields = defineRule(
    {
        id: "web.fields",
        title: "web fields have the right types",
        group: "Channels",
        stage: "document",
        severity: "error",
        section: "6",
    },
    (ctx) => {
        const web = docOf(ctx).web;
        if (web === undefined) return skip("No web (optional).");
        if (!isObject(web)) return fail("web", `must be an object, got ${describe(web)}`, 'Use {} or { "browser_session_endpoint": "https://..." }.');
        const problems = new Problems();
        if (web.browser_session_endpoint !== undefined) {
            problems.https("web.browser_session_endpoint", web.browser_session_endpoint, "browser_session_endpoint");
        }
        problems.optionalBoolean("web.disabled", web.disabled);
        problems.optionalBoolean("web.unscoped", web.unscoped);
        return problems.outcome;
    },
);

export const webDisabled = defineRule(
    {
        id: "web.disabled",
        title: "web.disabled has no browser endpoint and another channel",
        group: "Channels",
        stage: "document",
        severity: "error",
        section: "6",
    },
    (ctx) => {
        const doc = docOf(ctx);
        const web = doc.web;
        if (!isObject(web) || web.disabled !== true) return skip("web.disabled isn't set.");
        const problems = new Problems();
        if (web.browser_session_endpoint !== undefined) {
            problems.add("web.browser_session_endpoint", "must not be set when web.disabled is true", "Remove browser_session_endpoint, or set web.disabled to false.");
        }
        if (doc.agent === undefined && doc.apis === undefined) {
            problems.add("web.disabled", "a Company that asks agents not to browse must list agent or apis", "Add an agent or apis entry, or remove web.disabled.");
        }
        return problems.outcome;
    },
);

export const tasksEndpoint = defineRule(
    {
        id: "tasks.endpoint",
        title: "tasks.endpoint is an HTTPS URL",
        group: "Channels",
        stage: "document",
        severity: "error",
        section: "9",
    },
    (ctx) => {
        const tasks = docOf(ctx).tasks;
        if (tasks === undefined) return skip("No tasks (optional).");
        if (!isObject(tasks)) return fail("tasks", `must be an object, got ${describe(tasks)}`, 'Use { "endpoint": "https://..." }, or remove tasks.');
        if (tasks.endpoint === undefined) return fail("tasks.endpoint", "tasks.endpoint is missing, and it is required when tasks is present", "Add the endpoint, or remove tasks.");
        const problems = new Problems();
        problems.https("tasks.endpoint", tasks.endpoint, "endpoint");
        return problems.outcome;
    },
);

export const channelRules = [channelsPresent, agentProtocols, agentKnownType, agentUcp, agentAccess, apisEntries, apisTypes, webFields, webDisabled, tasksEndpoint];
