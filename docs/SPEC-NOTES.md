# Spec notes

What Pollen's rules are built from. Every rule in `src/rules/` cites a section of the
Personal Agent Protocol ("Poppy") specification. If the spec and this file ever disagree, the
spec wins: open an issue and we'll fix the rule.

Read on 2026-11-17, from the official repository at commit
[`a1deeab`](https://github.com/personal-agent-protocol/personal-agent-protocol/tree/a1deeab03c519b0597df4e060fe20bc16d41c31e).

## Sources

| What | URL |
| --- | --- |
| Site | https://personalagentprotocol.org/ |
| Introduction, roadmap, design partners | https://personalagentprotocol.org/docs/introduction |
| Specification 1.0 (published 2026-11-14) | https://personalagentprotocol.org/docs/1.0/spec |
| Spec source (MDX) | https://github.com/personal-agent-protocol/personal-agent-protocol/blob/main/content/versions/1.0/spec.mdx |
| Draft 1.1 source | https://github.com/personal-agent-protocol/personal-agent-protocol/blob/main/content/versions/1.1/spec.mdx |
| Version list | https://github.com/personal-agent-protocol/personal-agent-protocol/blob/main/content/versions/versions.json |
| Official `poppy.json` JSON Schema | https://github.com/personal-agent-protocol/personal-agent-protocol/blob/main/kit/company/schemas/poppy.schema.json |
| Extensions index | https://personalagentprotocol.org/docs/1.0/extensions |
| Operations extension | https://personalagentprotocol.org/docs/1.0/extensions/operations |
| UCP extension | https://personalagentprotocol.org/docs/1.0/extensions/ucp |
| Mediated Sign-In extension | https://personalagentprotocol.org/docs/1.0/extensions/mediated-sign-in |
| Announcement (Sierra, 2026-10-06) | https://sierra.ai/blog/introducing-personal-agent-protocol |

The protocol is licensed Apache-2.0. Pollen is a separate, independent MIT-licensed tool.

## Versions

From `content/versions/versions.json`:

| Version | Published |
| --- | --- |
| 0.1 | 2026-10-09 |
| 0.2 | 2026-10-24 |
| 0.3 | 2026-11-04 |
| 0.4 | 2026-11-10 |
| **1.0** | **2026-11-14** (current) |
| 1.1 | draft, unpublished |

Compatibility (spec 3.4): two versions are compatible when they have the same major version and,
before 1.0, the same minor version. From 1.0, a newer minor version doesn't break older Personal
Agents, which ignore fields they don't recognize. The 1.1 draft changes nothing in section 3 other
than the version number.

Pollen targets **1.0** and accepts any `1.x` document.

## The building blocks

The brief named five building blocks. The 1.0 spec's own list (section 1.1, "Protocol layers") is:

| Layer | Where it lives | Checked by Pollen? |
| --- | --- | --- |
| Discovery | `/.well-known/poppy.json` plus standard OAuth metadata (section 3) | **Yes**, all of it |
| Operator recognition | Web Bot Auth signatures (5.3) | No, runtime only |
| Sessions | The `Poppy-Session` JWT header on every request (section 5) | No, runtime only |
| Account access (sign-in) | Standard OAuth: Direct Sign-In, Device Sign-In (section 4) | Only the metadata that discovery depends on (3.2) |
| Interaction channels | APIs, web browsing, Company Agent conversations (sections 6, 7, 8) | Only how they are declared in `poppy.json` |
| Task coverage and extensions | `tasks` endpoint (section 9), `extensions` (3.3) | Only how they are declared |

"One session across channels" is the Sessions layer: one Session spans APIs, browsing, and
conversations (section 5, section 6 browser join). Pollen v1 is a discovery-document checker, so it
validates everything a Personal Agent reads *before* its first request, and nothing that only
happens at runtime.

## Where the document lives (section 3)

- MUST be published at `https://{domain}/.well-known/poppy.json`, over HTTPS, where `{domain}` is
  the Company's domain or a subdomain it controls.
- The well-known URL MAY redirect, even to another host. Every redirect MUST be to an HTTPS URL.
- Personal Agents use the document only when the **final** URL's path is exactly
  `/.well-known/poppy.json` and it has **no query**.
- The document speaks for the host that served it, after redirects.
- The spec doesn't require a Content-Type or caching headers for `poppy.json`, so Pollen has no
  rule about them.

## Fields (section 3.1)

Unknown fields are allowed: Personal Agents ignore fields they don't recognize.

| Field | Required | Rule |
| --- | --- | --- |
| `protocol_version` | **Yes** | String `major.minor`. This version is `1.0`. |
| `supported_versions` | No | Object: version (`major.minor`) to HTTPS URL of that version's document, on the host that served `poppy.json`. Lists the *other* versions served. |
| `organization` | **Yes** | Object with `name` (non-empty), `domain`, optional `logo_uri` (HTTPS). |
| `organization.domain` | **Yes** | MUST be the host that serves the document, after redirects, with its port when not 443. Compared ignoring case. A bare host, no scheme or path. |
| `auth` | No | `issuer`, `disabled`, `scopes`, `scope_hints`. |
| `auth.issuer` | If the protected resource metadata lists more than one authorization server | HTTPS. MUST be in that list. With one server it MAY be omitted, and if present MUST name it. |
| `auth.disabled` | No | Boolean, default `false`. `true` means no sign-in for Personal Agents even though there is an issuer. |
| `auth.scopes` | No | Map of scope name to non-empty description string (OpenAPI OAuth2 `scopes` form). |
| `auth.scope_hints` | No | Map of scope name to `{ "changes": "none" \| "reversible" \| "irreversible", "personal_data": boolean }`, both required. |
| `agent` | At least one of `agent`, `apis`, `web` | `protocols`: non-empty array of `{ type, endpoint (HTTPS), description (non-empty) }`. A `poppy` entry may add `access`: `session` (default) or `signed_in`. |
| `apis` | At least one of `agent`, `apis`, `web` | Array of `{ type, url (HTTPS), description (non-empty) }`. |
| `web` | At least one of `agent`, `apis`, `web` | Optional `browser_session_endpoint` (HTTPS), `disabled` (boolean), `unscoped` (boolean). |
| `tasks` | No | `{ endpoint }`, HTTPS, required when `tasks` is present. |
| `extensions` | No | Keyed by name; each value a non-empty array with one entry per major version, each with a `version` string. |

### Interface types

| Interface | Declared as | Defined types |
| --- | --- | --- |
| OpenAPI | `apis[].type = "openapi"`, `url` → OpenAPI 3.0/3.1 description | section 7 |
| MCP | `apis[].type = "mcp"`, `url` → remote MCP server (Streamable HTTP, MCP 2025-06-18+) | section 7 |
| Website | `web` object, optional `browser_session_endpoint` for browser join | section 6 |
| Company agent | `agent.protocols[]`: type `poppy` (section 8), or `ucp` for UCP Ask (UCP extension 5) | section 8.1 |

Personal Agents skip API types and conversation protocol types they don't recognize (7, 8.1), so
an unknown type is a warning, not an error.

A `ucp` entry in `agent.protocols` (UCP extension, section 5): the Company MUST also list the `ucp`
extension, and the entry's `endpoint` is the Company's UCP profile,
`https://{organization.domain}/.well-known/ucp` (UCP 2).

## Cross-field rules

- `web.disabled: true` → MUST NOT list `browser_session_endpoint`, and MUST list `agent` or `apis`
  (section 6).
- `auth.disabled: true` → MUST NOT list the `mediated-sign-in` extension or `signed_in` access
  (3.2).
- `access: "signed_in"` → the Company MUST have an issuer and MUST NOT set `auth.disabled` (3.2).
  Unknown `access` values are ignored as an absent hint.
- Every URL in the document MUST be HTTPS (section 3, "HTTPS").

## Sign-in and OAuth metadata (section 3.2)

Sign-in location is **not** a field of `poppy.json`. It's declared through standard OAuth metadata:

1. Protected resource metadata (RFC 9728) at
   `https://{organization.domain}/.well-known/oauth-protected-resource`.
   - HTTP 404, or `authorization_servers` absent or empty → no issuer. Valid only when
     `auth.issuer` is absent and the Company offers no sign-in.
   - Any other error, a timeout, or invalid metadata → Personal Agents MUST NOT fall back.
   - `resource` MUST be exactly `https://{organization.domain}`.
   - One authorization server → that is the issuer. More than one → `auth.issuer` picks one.
2. Authorization server metadata (RFC 8414) at the URL RFC 8414 §3.1 defines
   (`https://host/.well-known/oauth-authorization-server{issuer path}`).
   - `issuer` MUST match the issuer found, character for character.
   - `protected_resources` MUST include `https://{organization.domain}` (host lowercased).
   - Required: `token_endpoint`, `revocation_endpoint`, `grant_types_supported` including
     `refresh_token`.
   - `authorization_code` in `grant_types_supported` → Direct Sign-In; `authorization_endpoint`
     required.
   - `urn:ietf:params:oauth:grant-type:device_code` → Device Sign-In;
     `device_authorization_endpoint` required.
   - The Mediated Sign-In grant is `https://personalagentprotocol.org/grant/mediated-sign-in`.

3. Scopes: a Company that offers sign-in SHOULD list every scope a Personal Agent can request in
   `scopes_supported`, in the issuer's metadata, the protected resource metadata, or both (3.2).
   Mediated Sign-In scopes SHOULD be there too (Mediated Sign-In 2). Pollen warns about scopes named
   in `poppy.json` that neither lists.

Pollen checks these for live URLs (skip with `--skip-oauth`). For local files they're skipped,
because there's no host to fetch them from.

## Extensions (section 3.3)

- Plain names (no domain) are reserved for extensions defined with the protocol. Anyone else MUST
  prefix the name with a domain they control, such as `example.com/gift-wrap`.
- Defined in 1.0: `browser-control` (v1), `disclosures` (v1), `links` (v1), `mediated-sign-in`
  (v1, transitional), `operations` (v3), `ucp` (v1).
- `mediated-sign-in` version `1` entries require `fields` (non-empty array of
  `{ name, label, secret }`) and `scopes` (non-empty array of scope tokens). A field `name` can't be
  `grant_type`, `scope`, `client_id`, `client_secret`, `client_assertion`,
  `client_assertion_type`, `resource`, `sign_in_id` or `one_time_code`.
- Mediated Sign-In is transitional: the roadmap plans to remove it on 2027-03-17 and prefers Direct
  Sign-In. Its issuer lists `https://personalagentprotocol.org/grant/mediated-sign-in` in
  `grant_types_supported` (Mediated Sign-In 2).
- Operations (Operations 2): an entry with an `endpoint` means the website returns operations, and
  the Company MUST then list `web.browser_session_endpoint`, because only a browser joined to a
  Session gets operations. The extension is used only when the Company lists `version` `"3"`.
- More generally, an extension is used only at a version both sides support, so a defined extension
  listed without its 1.0 version is ignored by 1.0 Personal Agents (Pollen warns).

## Versions (section 3.4)

- Each `supported_versions` URL MUST be HTTPS on the host that served `poppy.json`.
- Keys are `major.minor`, and name versions *other* than `protocol_version`.

### How Pollen treats other versions

Pollen's rules are the 1.0 rules, and versions before 1.0 differ in breaking ways. For example,
`agent.protocols[].description` became required in 1.0 (changelog, "Conversation protocol
descriptions", breaking), so a valid 0.4 document fails the 1.0 field rules. So:

- A document whose `protocol_version` isn't 1.x fails `version.compatible` (an error): before 1.0 a
  version is compatible only with the same minor version, so a Personal Agent that implements only
  1.0 MUST NOT use it (3.4).
- Unless `supported_versions` lists a 1.x document: a 1.0 Personal Agent uses that one instead, so
  `version.compatible` passes. Pollen doesn't fetch that document yet.
- Either way, the 1.0 field rules and OAuth checks are skipped for a non-1.x document. Only the
  rules for what 3.4 says keeps its meaning in every version still run: the location and fetching
  of `poppy.json`, `protocol_version`, and `supported_versions`.
- A missing or malformed `protocol_version` fails `version.present` or `version.format`, and the
  1.0 rules still run, since there's no other version to judge by.

Found in the wild: Shopify publishes a `poppy.json` for every store, and on 2026-11-17 the ones
checked declared `0.4` with agent entries that have no `description`.

## Score

Not part of the spec; Pollen's own measure. The score starts at 100. Each failed error rule costs
25 points and each failed warning 5, down to 0. A missing or unreadable document scores 0. Any
failed error rule means FAIL (exit code 1), whatever the score.
