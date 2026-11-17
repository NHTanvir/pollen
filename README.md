# Pollen: the poppy.json validator for the Personal Agent Protocol

**Check any site's `/.well-known/poppy.json` against Poppy 1.0 in one command: PASS or FAIL for every rule, a 0–100 score, and the exact fix for each failure.**

[![CI](https://github.com/NHTanvir/pollen/actions/workflows/ci.yml/badge.svg)](https://github.com/NHTanvir/pollen/actions/workflows/ci.yml)
[![Poppy 1.0](https://img.shields.io/badge/Poppy-1.0-ffb000)](https://personalagentprotocol.org/docs/1.0/spec)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-18%2B-339933)](package.json)
[![Runtime dependencies: 0](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](package.json)

```sh
npx github:NHTanvir/pollen check https://example.com
```

No install and no account: `npx` runs Pollen straight from this repository. Swap in your own domain.

Pollen is the linter and doctor for Poppy adoption. It reads your discovery file the way a Personal Agent does, follows every redirect, checks the OAuth metadata your sign-in depends on, and tells you what to change. It is deterministic and makes no LLM calls: the same site always gets the same report.

## What a report looks like

A fictional `shop.example` with three common mistakes. The network is simulated for the example, but every line is Pollen's real output, and the test suite regenerates it to keep this README honest.

```text
$ npx github:NHTanvir/pollen check shop.example
pollen 0.1.0 · Poppy 1.0 discovery check
target  https://shop.example/.well-known/poppy.json

Transport
  PASS  transport.https            Served over HTTPS, redirects included  §3
  PASS  transport.status           Responds with HTTP 200  §3
  PASS  transport.final-url        Final URL is exactly /.well-known/poppy.json, with no query  §3

Document
  PASS  document.json              Is a valid JSON object  §3.1
  PASS  version.present            protocol_version is present and a string  §3.1
  PASS  version.format             protocol_version is major.minor  §3.1
  PASS  version.compatible         protocol_version is compatible with 1.0  §3.4
  PASS  organization.present       organization is present and an object  §3.1
  PASS  organization.name          organization.name is a non-empty string  §3.1
  PASS  organization.domain        organization.domain is a bare host name  §3.1
  PASS  organization.domain-host   organization.domain matches the host that served it  §3
  SKIP  organization.logo, versions.supported (not applicable)

Channels
  PASS  channels.present           Lists at least one channel: agent, apis, or web  §3.1
  PASS  agent.protocols            agent.protocols entries have type, HTTPS endpoint, and description  §8.1
  PASS  agent.known-type           agent.protocols has a "poppy" or "ucp" entry  §8.1
  PASS  apis.entries               apis entries have type, HTTPS url, and description  §7
  WARN  apis.types                 apis types are "openapi" or "mcp"  §7
        ✗ apis[0].type: "OpenAPI" isn't an API type this version defines, so Personal Agents skip it
          fix: Use lowercase "openapi".
          https://personalagentprotocol.org/docs/1.0/spec#apis
  PASS  web.fields                 web fields have the right types  §6
  FAIL  web.disabled               web.disabled has no browser endpoint and another channel  §6
        ✗ web.browser_session_endpoint: must not be set when web.disabled is true
          fix: Remove browser_session_endpoint, or set web.disabled to false.
          https://personalagentprotocol.org/docs/1.0/spec#web-browsing
  SKIP  agent.ucp, agent.access, tasks.endpoint (not applicable)

Sign-in
  PASS  auth.fields                auth.issuer is HTTPS and auth.disabled is a boolean  §3.1
  PASS  auth.scopes                auth.scopes maps scope names to descriptions  §4.7
  SKIP  auth.scope-hints, auth.disabled-conflicts (not applicable)

Extensions
  SKIP  extensions.shape, extensions.names, extensions.versions, operations.browser-join, mediated.fields, mediated.transitional (not applicable)

OAuth metadata
  PASS  oauth.resource-metadata    Protected resource metadata is valid JSON, or a clean 404  §3.2
  PASS  oauth.resource             Protected resource metadata names this domain  §3.2
  PASS  oauth.issuer               auth.issuer agrees with the authorization servers listed  §3.2
  PASS  oauth.server-metadata      Issuer publishes metadata with a matching issuer  §3.2
  FAIL  oauth.protected-resources  Issuer lists this domain in protected_resources  §3.2
        ✗ https://auth.shop.example/.well-known/oauth-authorization-server → protected_resources: doesn't list https://shop.example, so the issuer doesn't confirm it serves this domain and Personal Agents won't trust the link
          fix: Add "https://shop.example" to protected_resources, with no path or trailing slash.
          https://personalagentprotocol.org/docs/1.0/spec#oauth-server
  PASS  oauth.endpoints            Issuer metadata has the endpoints and grants Poppy needs  §3.2
  PASS  oauth.scopes-supported     Scopes in poppy.json are listed in scopes_supported  §3.2
  PASS  oauth.sign-in-grant        Issuer offers a way to sign in, or auth.disabled says it doesn't  §3.2
  SKIP  oauth.mediated-grant (not applicable)

Score 45/100   25 passed · 2 errors · 1 warning · 14 skipped
FAIL  Fix the 2 errors above before Poppy 1.0 Personal Agents can use this document.
```

## What is Poppy?

**Poppy, the Personal Agent Protocol, is an open standard for how personal AI agents work with businesses on a user's behalf.** A business publishes one JSON file, `/.well-known/poppy.json`, that names it, lists the ways an agent can reach it (APIs such as OpenAPI and MCP, its website, its own company agent), and points to the OAuth sign-in where users grant scoped access.

Sierra and Meta announced it on October 6, 2026, and version 1.0 shipped in November 2026. Meta, OpenAI, Shopify, Stripe and Walmart are among its design partners. According to [Sierra's 1.0 announcement](https://sierra.ai/blog/releasing-poppy), every Shopify store now publishes a Poppy file automatically, and Meta's Muse agent looks for Poppy first on every site it visits.

Read the [specification](https://personalagentprotocol.org/docs/1.0/spec), the [introduction](https://personalagentprotocol.org/docs/introduction), or the [source repository](https://github.com/personal-agent-protocol/personal-agent-protocol). The protocol is licensed Apache-2.0; Pollen is a separate, independent MIT-licensed tool.

## Why Pollen

- **Built on the published 1.0 spec, not a draft.** All 42 rules cite the section they enforce, and [docs/SPEC-NOTES.md](docs/SPEC-NOTES.md) records where each requirement comes from.
- **Checks the whole discovery chain.** HTTPS on every redirect, the exact well-known path, `organization.domain` against the host that served the file, and the issuer link through [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728) protected resource metadata and [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414) server metadata. A file can be valid JSON and still be unusable; Pollen tells you why.
- **Knows which version it's reading.** A 0.4 document isn't failed for missing 1.0-only fields. Pollen reports the version as the problem, which is what matters to a 1.0 agent.
- **Fixes, not just failures.** Every problem names the JSON path, says what's wrong, and gives the change to make.
- **Made for CI.** `--json` output, meaningful exit codes, and a [GitHub Action](#github-action) that fails the build when your deployed `poppy.json` breaks.
- **Small and dependable.** TypeScript on Node 18+, zero runtime dependencies, 300+ tests, and an offline `pollen demo`.

## Usage

### Check a site or a file

```sh
npx github:NHTanvir/pollen check example.com                       # a domain
npx github:NHTanvir/pollen check https://example.com                # a URL, with or without the path
npx github:NHTanvir/pollen check ./public/.well-known/poppy.json    # a local file, before you deploy
```

A local file gets every document rule. The transport and OAuth rules need a live URL, so check the deployed domain too.

| Option | What it does |
| --- | --- |
| `--json` | Print the report as JSON, for CI and scripts |
| `--failures-only` | Show only the rules that failed |
| `--skip-oauth` | Don't fetch the OAuth metadata (live URLs only) |
| `--timeout <ms>` | Per-request timeout, default `10000` |
| `--no-color` | Plain output. `NO_COLOR` is respected too |

Exit codes: `0` passed, `1` failed (at least one error), `2` usage error.

### Machine-readable output

```sh
npx github:NHTanvir/pollen check example.com --json | jq '{score, ok, errors: .summary.errors}'
```

Each result has a stable `id`, its `status` (`pass`, `fail` or `skip`), `severity`, spec `section` and `spec_url`, and a list of `problems`, each with a `path`, `message` and `fix`.

### Generate a starter poppy.json

```text
$ npx github:NHTanvir/pollen init
pollen init: a starter poppy.json for Personal Agent Protocol 1.0.

Company name: Orbit Air
Domain that will serve poppy.json, such as example.com: orbit.example

Sign-in. Personal Agents sign Users in through your OAuth issuer (Direct Sign-In).
OAuth issuer URL, where Users sign in (blank if you don't offer sign-in yet): https://auth.orbit.example

Interfaces. Leave a question blank to skip that interface.
May Personal Agents browse your website? [Y/n]: y
Browser session endpoint, if you support browser join:
Company agent conversation endpoint (Poppy protocol): https://api.orbit.example/poppy/conversations
  What can your agent help with? [Anything about Orbit Air]: Trips, seats, and bags
OpenAPI description URL: https://api.orbit.example/openapi.json
  What is the API for? [Orbit Air API]:
MCP server URL:

Wrote poppy.json (pollen score 100/100).
```

It writes a document that passes every rule, then prints next steps: where to serve it and, if you offer sign-in, the OAuth metadata to publish. Use `--out public/.well-known/poppy.json` to write it straight into your site, and `--force` to overwrite.

### Try it offline

```sh
npx github:NHTanvir/pollen demo
```

Runs Pollen against the bundled example documents, with no network: 5 that pass, and 15 that each break exactly one rule, then prints one full report.

## GitHub Action

Fail the build when your deployed `poppy.json` breaks:

```yaml
name: poppy.json
on:
  push:
  schedule:
    - cron: "0 6 * * *" # also catch changes made outside this repository
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: NHTanvir/pollen@v0.1.0
        with:
          target: example.com
```

| Input | Default | What it does |
| --- | --- | --- |
| `target` | (required) | Domain, URL, or path to a `poppy.json` in your repository (add `actions/checkout` first) |
| `skip-oauth` | `false` | Don't fetch the OAuth metadata |
| `timeout` | `10000` | Per-request timeout in milliseconds |

The report goes to the job log and the job summary. The `exit-code` output is `0`, `1` or `2`, as above.

## How scoring works

Every rule either passes, fails, or is skipped because it doesn't apply, such as the OAuth rules for a company with no sign-in. The score starts at 100. Each failed **error** costs 25 points and each failed **warning** costs 5, down to 0. A missing or unreadable document scores 0.

Any failed error means **FAIL** and exit code 1, whatever the score. Errors are spec requirements (MUST): a Personal Agent may refuse the document. Warnings are things agents ignore or skip, so a feature silently doesn't work.

## The rules

<details>
<summary>All 42 rules, with the spec section each one enforces</summary>

| Rule | Checks | Severity | Spec |
| --- | --- | --- | --- |
| **Transport** | | | |
| `transport.https` | Served over HTTPS, redirects included | error | [§3](https://personalagentprotocol.org/docs/1.0/spec#discovery) |
| `transport.status` | Responds with HTTP 200 | error | [§3](https://personalagentprotocol.org/docs/1.0/spec#discovery) |
| `transport.final-url` | Final URL is exactly /.well-known/poppy.json, with no query | error | [§3](https://personalagentprotocol.org/docs/1.0/spec#discovery) |
| **Document** | | | |
| `document.json` | Is a valid JSON object | error | [§3.1](https://personalagentprotocol.org/docs/1.0/spec#fields) |
| `version.present` | protocol_version is present and a string | error | [§3.1](https://personalagentprotocol.org/docs/1.0/spec#fields) |
| `version.format` | protocol_version is major.minor | error | [§3.1](https://personalagentprotocol.org/docs/1.0/spec#fields) |
| `version.compatible` | protocol_version is compatible with 1.0 | error | [§3.4](https://personalagentprotocol.org/docs/1.0/spec#versions) |
| `organization.present` | organization is present and an object | error | [§3.1](https://personalagentprotocol.org/docs/1.0/spec#fields) |
| `organization.name` | organization.name is a non-empty string | error | [§3.1](https://personalagentprotocol.org/docs/1.0/spec#fields) |
| `organization.domain` | organization.domain is a bare host name | error | [§3.1](https://personalagentprotocol.org/docs/1.0/spec#fields) |
| `organization.domain-host` | organization.domain matches the host that served it | error | [§3](https://personalagentprotocol.org/docs/1.0/spec#discovery) |
| `organization.logo` | organization.logo_uri is an HTTPS URL | error | [§3.1](https://personalagentprotocol.org/docs/1.0/spec#fields) |
| `versions.supported` | supported_versions maps other versions to HTTPS URLs on this host | error | [§3.4](https://personalagentprotocol.org/docs/1.0/spec#versions) |
| **Channels** | | | |
| `channels.present` | Lists at least one channel: agent, apis, or web | error | [§3.1](https://personalagentprotocol.org/docs/1.0/spec#fields) |
| `agent.protocols` | agent.protocols entries have type, HTTPS endpoint, and description | error | [§8.1](https://personalagentprotocol.org/docs/1.0/spec#conversation-protocols) |
| `agent.known-type` | agent.protocols has a "poppy" or "ucp" entry | warning | [§8.1](https://personalagentprotocol.org/docs/1.0/spec#conversation-protocols) |
| `agent.ucp` | ucp entries point at the UCP profile and list the "ucp" extension | error | [UCP 5](https://personalagentprotocol.org/docs/1.0/extensions/ucp#conversations) |
| `agent.access` | access hints are "session" or "signed_in" | warning | [§3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server) |
| `apis.entries` | apis entries have type, HTTPS url, and description | error | [§7](https://personalagentprotocol.org/docs/1.0/spec#apis) |
| `apis.types` | apis types are "openapi" or "mcp" | warning | [§7](https://personalagentprotocol.org/docs/1.0/spec#apis) |
| `web.fields` | web fields have the right types | error | [§6](https://personalagentprotocol.org/docs/1.0/spec#web-browsing) |
| `web.disabled` | web.disabled has no browser endpoint and another channel | error | [§6](https://personalagentprotocol.org/docs/1.0/spec#web-browsing) |
| `tasks.endpoint` | tasks.endpoint is an HTTPS URL | error | [§9](https://personalagentprotocol.org/docs/1.0/spec#task-coverage) |
| **Sign-in** | | | |
| `auth.fields` | auth.issuer is HTTPS and auth.disabled is a boolean | error | [§3.1](https://personalagentprotocol.org/docs/1.0/spec#fields) |
| `auth.scopes` | auth.scopes maps scope names to descriptions | error | [§4.7](https://personalagentprotocol.org/docs/1.0/spec#scopes) |
| `auth.scope-hints` | auth.scope_hints have changes and personal_data | error | [§4.7](https://personalagentprotocol.org/docs/1.0/spec#scopes) |
| `auth.disabled-conflicts` | auth.disabled doesn't advertise sign-in anywhere else | error | [§3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server) |
| **Extensions** | | | |
| `extensions.shape` | extensions are lists of entries with a version | error | [§3.3](https://personalagentprotocol.org/docs/1.0/spec#extensions) |
| `extensions.names` | extension names are defined or start with a domain | warning | [§3.3](https://personalagentprotocol.org/docs/1.0/spec#extensions) |
| `extensions.versions` | defined extensions include their 1.0 version | warning | [Extensions index](https://personalagentprotocol.org/docs/1.0/extensions#list) |
| `operations.browser-join` | an operations endpoint comes with web.browser_session_endpoint | error | [Operations 2](https://personalagentprotocol.org/docs/1.0/extensions/operations#support) |
| `mediated.fields` | mediated-sign-in v1 lists fields and scopes | error | [Mediated Sign-In 2](https://personalagentprotocol.org/docs/1.0/extensions/mediated-sign-in#support) |
| `mediated.transitional` | Doesn't depend on Mediated Sign-In, which is being removed | warning | [Roadmap](https://personalagentprotocol.org/docs/introduction#mediated-sign-in) |
| **OAuth metadata** | | | |
| `oauth.resource-metadata` | Protected resource metadata is valid JSON, or a clean 404 | error | [§3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server) |
| `oauth.resource` | Protected resource metadata names this domain | error | [§3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server) |
| `oauth.issuer` | auth.issuer agrees with the authorization servers listed | error | [§3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server) |
| `oauth.server-metadata` | Issuer publishes metadata with a matching issuer | error | [§3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server) |
| `oauth.protected-resources` | Issuer lists this domain in protected_resources | error | [§3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server) |
| `oauth.endpoints` | Issuer metadata has the endpoints and grants Poppy needs | error | [§3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server) |
| `oauth.scopes-supported` | Scopes in poppy.json are listed in scopes_supported | warning | [§3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server) |
| `oauth.sign-in-grant` | Issuer offers a way to sign in, or auth.disabled says it doesn't | warning | [§3.2](https://personalagentprotocol.org/docs/1.0/spec#oauth-server) |
| `oauth.mediated-grant` | Issuer supports the Mediated Sign-In grant it advertises | error | [Mediated Sign-In 2](https://personalagentprotocol.org/docs/1.0/extensions/mediated-sign-in#support) |
</details>

## FAQ

### How do I check if my poppy.json is valid?

Run `npx github:NHTanvir/pollen check yourdomain.com`. Pollen fetches `https://yourdomain.com/.well-known/poppy.json` the way a Personal Agent does, checks it against all 42 rules of Poppy 1.0, and prints PASS or FAIL for each rule, a 0–100 score, and a fix for every failure.

### Where does poppy.json go?

At `https://{your-domain}/.well-known/poppy.json`, served over HTTPS. In Next.js, Vite or Astro, that means `public/.well-known/poppy.json`. Some hosts and static site generators skip folders that start with a dot, so check that the URL actually returns the file. Pollen's `transport.status` rule catches it if it doesn't.

### What does a minimal valid poppy.json look like?

```json
{
  "protocol_version": "1.0",
  "organization": { "name": "Example Company", "domain": "example.com" },
  "web": {}
}
```

`protocol_version` and `organization` are required, plus at least one channel: `web`, `apis` or `agent`. An empty `web` object lets Personal Agents browse your site as signed-out visitors. Run `pollen init` to build a fuller one.

### Why does my Shopify store fail `version.compatible`?

Shopify publishes a Poppy file for every store. When we checked several Shopify stores on November 17, 2026, their files declared `protocol_version` `0.4`. Before 1.0, versions are only compatible with the exact same minor version (spec 3.4), so an agent that implements only 1.0 must not use a 0.4 file. Shopify generates the file, so the update has to come from Shopify.

### What changed between Poppy 0.4 and 1.0?

The [changelog](https://personalagentprotocol.org/docs/changelog) lists every change. One that breaks 0.4 documents: each `agent.protocols` entry now needs a `description` saying what the agent can help with. Pollen checks pre-1.0 documents for the version problem only, so a 0.4 file isn't buried in 1.0 errors.

### Does Pollen use AI?

No. Every check is a deterministic rule written from the spec, with no LLM calls, so the same site always gets the same report. It only makes the HTTP requests a Personal Agent would make during discovery.

### How is Pollen different from the official implementation kit?

The [official company kit](https://personalagentprotocol.org/kit/company) gives implementers JSON Schemas, a validator for them, and a coding-agent skill. Pollen checks a deployed site end to end: it fetches the file over the network, follows redirects, applies the cross-field and OAuth rules, scores the result, and suggests fixes. For more Poppy tools, see [awesome-poppy](https://github.com/JaviChulvi/awesome-poppy).

### Is Pollen official?

No. Pollen is an independent open-source project. It isn't affiliated with or endorsed by Sierra, Meta, or the authors of the Personal Agent Protocol.

## Use it as a library

```js
import { check, validateDocument, formatText } from "@nhtanvir/pollen";

const report = await check("example.com"); // or validateDocument(jsonOrObject)
console.log(report.score, report.ok);
console.log(formatText(report));
```

Until the package is on npm, install it from GitHub: `npm install github:NHTanvir/pollen`.

## Contributing

Contributions are welcome. Pollen is small on purpose, so it's a good place to make a first contribution to the Poppy ecosystem:

- **Found a false positive or a missed problem?** [Open an issue](https://github.com/NHTanvir/pollen/issues/new) with the URL or the document, and the spec section.
- **Add a rule.** Each one is a short function with a spec citation, plus test cases; the tests make sure no rule ships without them.
- **Ideas on the roadmap:** check the documents listed in `supported_versions`, check that listed OpenAPI and MCP URLs respond, and a web playground.

See [CONTRIBUTING.md](CONTRIBUTING.md) to get set up. It takes about a minute.

## License

[MIT](LICENSE) © NHTanvir. The Personal Agent Protocol specification is © its authors, licensed [Apache-2.0](https://github.com/personal-agent-protocol/personal-agent-protocol/blob/main/LICENSE); `tests/fixtures/valid/spec-example.json` is the example from its section 3.
