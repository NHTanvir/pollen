// Finds the Company's OAuth issuer the way a Personal Agent does (spec 3.2): protected resource
// metadata (RFC 9728) on the domain, then the issuer's authorization server metadata (RFC 8414).

import { fetchFollowing, parseJson, type FetchOptions } from "./fetch.js";
import { AUTHORIZATION_SERVER_PATH, PROTECTED_RESOURCE_PATH } from "./spec.js";
import type { OAuthDiscovery } from "./types.js";
import { isHttpsUrl, isObject, type Json } from "./util.js";

/** RFC 8414 §3.1: the well-known segment goes between the host and the issuer's path. */
export function serverMetadataUrl(issuer: string): string {
    const url = new URL(issuer);
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.origin}${AUTHORIZATION_SERVER_PATH}${path}`;
}

/** The authorization servers the metadata lists, or undefined when it lists none or is unusable. */
export function authorizationServers(discovery: OAuthDiscovery): unknown[] | undefined {
    const json = discovery.resourceMetadataJson;
    if (discovery.resourceMetadata.status !== 200 || !json?.ok || !isObject(json.value)) return undefined;
    const servers = json.value.authorization_servers;
    return Array.isArray(servers) ? servers : undefined;
}

/** The issuer a Personal Agent selects: the only server, or auth.issuer when there are several. */
export function selectIssuer(servers: unknown[] | undefined, doc: Json): string | undefined {
    if (!servers || servers.length === 0) return undefined;
    if (servers.length === 1) return typeof servers[0] === "string" ? servers[0] : undefined;
    const chosen = isObject(doc.auth) ? doc.auth.issuer : undefined;
    return typeof chosen === "string" && servers.includes(chosen) ? chosen : undefined;
}

export async function discoverOAuth(domain: string, doc: Json, options: FetchOptions): Promise<OAuthDiscovery> {
    const resourceMetadataUrl = `https://${domain.toLowerCase()}${PROTECTED_RESOURCE_PATH}`;
    const resourceMetadata = await fetchFollowing(resourceMetadataUrl, options);
    const discovery: OAuthDiscovery = { resourceMetadataUrl, resourceMetadata };
    if (resourceMetadata.status === 200 && !resourceMetadata.error) {
        discovery.resourceMetadataJson = parseJson(resourceMetadata.body);
    }

    const issuer = selectIssuer(authorizationServers(discovery), doc);
    if (!issuer || !isHttpsUrl(issuer)) return discovery;
    discovery.issuer = issuer;
    discovery.serverMetadataUrl = serverMetadataUrl(issuer);
    discovery.serverMetadata = await fetchFollowing(discovery.serverMetadataUrl, options);
    if (discovery.serverMetadata.status === 200 && !discovery.serverMetadata.error) {
        discovery.serverMetadataJson = parseJson(discovery.serverMetadata.body);
    }
    return discovery;
}
