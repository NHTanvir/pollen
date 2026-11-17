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

export function specUrl(section: string): string {
    if (section === "Mediated Sign-In") return `${EXTENSIONS_BASE}/mediated-sign-in`;
    if (section === "Roadmap") return ROADMAP_URL;
    const anchor = SECTION_ANCHORS[section];
    return anchor ? `${SPEC_BASE}#${anchor}` : SPEC_BASE;
}

/** API types defined in section 7. Personal Agents skip others. */
export const API_TYPES = ["openapi", "mcp"] as const;

/** Conversation protocol types defined in section 8.1. */
export const CONVERSATION_TYPES = ["poppy"] as const;

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
