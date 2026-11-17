// Keeps README.md honest: its example report is what the code prints today, and it lists every rule.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { check } from "../src/check.js";
import { formatText } from "../src/report.js";
import { RULES } from "../src/rules/index.js";
import { fakeFetcher } from "./helpers.js";

const README = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

/** The fictional shop.example from the README: three common mistakes. */
async function shopExample(): Promise<string> {
    const doc = {
        protocol_version: "1.0",
        organization: { name: "Juniper Outfitters", domain: "shop.example" },
        auth: { scopes: { "orders:read": "See your orders and returns" } },
        agent: { protocols: [{ type: "poppy", endpoint: "https://api.shop.example/poppy/conversations", description: "Orders, returns, and sizing" }] },
        apis: [{ type: "OpenAPI", url: "https://api.shop.example/openapi.json", description: "Orders and returns" }],
        web: { disabled: true, browser_session_endpoint: "https://shop.example/poppy/browser-session" },
    };
    const fetcher = fakeFetcher({
        "https://shop.example/.well-known/poppy.json": { body: doc },
        "https://shop.example/.well-known/oauth-protected-resource": { body: { resource: "https://shop.example", authorization_servers: ["https://auth.shop.example"] } },
        "https://auth.shop.example/.well-known/oauth-authorization-server": {
            body: {
                issuer: "https://auth.shop.example",
                token_endpoint: "https://auth.shop.example/oauth/token",
                revocation_endpoint: "https://auth.shop.example/oauth/revoke",
                authorization_endpoint: "https://auth.shop.example/oauth/authorize",
                grant_types_supported: ["refresh_token", "authorization_code"],
                scopes_supported: ["orders:read"],
                protected_resources: ["https://www.shop.example"],
            },
        },
    });
    return formatText(await check("shop.example", { fetcher }));
}

describe("README.md", () => {
    it("shows exactly the report the current code prints", async () => {
        const report = await shopExample();
        assert.ok(README.includes(`$ npx github:NHTanvir/pollen check shop.example\n${report}\`\`\``), "regenerate the example report in README.md");
    });

    it("lists every rule, and the right number of them", () => {
        for (const rule of RULES) assert.ok(README.includes(`| \`${rule.id}\` |`), `README is missing ${rule.id}`);
        assert.ok(README.includes(`All ${RULES.length} rules`));
    });

    it("only shows commands that work without an npm release", () => {
        assert.ok(README.includes("npx github:NHTanvir/pollen check https://example.com"));
        assert.doesNotMatch(README, /npx pollen\b/, "plain `npx pollen` runs an unrelated npm package");
        assert.doesNotMatch(README, /npx @nhtanvir\/pollen/, "the scoped package isn't on npm yet");
    });
});
