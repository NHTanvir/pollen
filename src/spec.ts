// Facts taken from the Personal Agent Protocol 1.0 specification. See docs/SPEC-NOTES.md for the
// source of each one.

/** The spec version Pollen's rules follow. */
export const SPEC_VERSION = "1.0";

/** Published versions, from content/versions/versions.json. 1.1 is a draft. */
export const PUBLISHED_VERSIONS = ["0.1", "0.2", "0.3", "0.4", "1.0"] as const;

export const WELL_KNOWN_PATH = "/.well-known/poppy.json";
export const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
export const AUTHORIZATION_SERVER_PATH = "/.well-known/oauth-authorization-server";

export const SPEC_BASE = "https://personalagentprotocol.org/docs/1.0/spec";
export const EXTENSIONS_BASE = "https://personalagentprotocol.org/docs/1.0/extensions";
export const ROADMAP_URL = "https://personalagentprotocol.org/docs/introduction#mediated-sign-in";
export const CHANGELOG_URL = "https://personalagentprotocol.org/docs/changelog";

/** Spec section number to its anchor on the spec page. */
export const SECTION_ANCHORS: Record<string, string> = {
    "3": "discovery",
    "3.1": "fields",
    "3.2": "oauth-server",
    "3.3": "extensions",
    "3.4": "versions",
    "4": "oauth",
    "4.7": "scopes",
    "6": "web-browsing",
    "7": "apis",
    "8.1": "conversation-protocols",
    "9": "task-coverage",
};

/** Sections of extension pages and other docs that rules cite, by the label the report shows. */
export const DOC_SECTIONS: Record<string, string> = {
    "Extensions index": `${EXTENSIONS_BASE}#list`,
    "Mediated Sign-In 2": `${EXTENSIONS_BASE}/mediated-sign-in#support`,
    "Operations 2": `${EXTENSIONS_BASE}/operations#support`,
    "UCP 5": `${EXTENSIONS_BASE}/ucp#conversations`,
    Roadmap: ROADMAP_URL,
};

export function specUrl(section: string): string {
    const doc = DOC_SECTIONS[section];
    if (doc) return doc;
    const anchor = SECTION_ANCHORS[section];
    return anchor ? `${SPEC_BASE}#${anchor}` : SPEC_BASE;
}

/** API types defined in section 7. Personal Agents skip others. */
export const API_TYPES = ["openapi", "mcp"] as const;

/** Conversation protocol types: "poppy" from section 8.1, and "ucp" from the UCP extension (UCP 5). */
export const CONVERSATION_TYPES = ["poppy", "ucp"] as const;

/** Where a "ucp" agent entry must point: the UCP profile on organization.domain (UCP 2, 5). */
export const UCP_PROFILE_PATH = "/.well-known/ucp";

/** Values of agent.protocols[].access defined in section 3.2. */
export const ACCESS_VALUES = ["session", "signed_in"] as const;

/** Values of auth.scope_hints[].changes, section 4.7. */
export const SCOPE_CHANGES = ["none", "reversible", "irreversible"] as const;

/** Extensions defined with the protocol (1.0 extensions index), and their current versions. */
export const DEFINED_EXTENSIONS: Record<string, string> = {
    "browser-control": "1",
    disclosures: "1",
    links: "1",
    "mediated-sign-in": "1",
    operations: "3",
    ucp: "1",
};

export const MEDIATED_SIGN_IN = "mediated-sign-in";
export const MEDIATED_SIGN_IN_GRANT = "https://personalagentprotocol.org/grant/mediated-sign-in";
export const MEDIATED_SIGN_IN_REMOVAL = "2027-03-17";

/** Mediated Sign-In field names that collide with token request parameters. */
export const RESERVED_FIELD_NAMES = [
    "grant_type",
    "scope",
    "client_id",
    "client_secret",
    "client_assertion",
    "client_assertion_type",
    "resource",
    "sign_in_id",
    "one_time_code",
] as const;

export const GRANT_REFRESH = "refresh_token";
export const GRANT_AUTHORIZATION_CODE = "authorization_code";
export const GRANT_DEVICE_CODE = "urn:ietf:params:oauth:grant-type:device_code";
