import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchFollowing, parseJson, USER_AGENT } from "../src/fetch.js";
import { VERSION } from "../src/version.js";
import { fakeFetcher, networkError, redirect } from "./helpers.js";

describe("fetchFollowing", () => {
    it("follows relative redirects and records every hop", async () => {
        const fetcher = fakeFetcher({
            "https://a.example/start": redirect("/next", 302),
            "https://a.example/next": redirect("https://b.example/end", 308),
            "https://b.example/end": { body: { ok: true } },
        });
        const res = await fetchFollowing("https://a.example/start", { fetcher });
        assert.equal(res.status, 200);
        assert.equal(res.finalUrl, "https://b.example/end");
        assert.deepEqual(
            res.hops.map((h) => h.status),
            [302, 308, 200],
        );
        assert.deepEqual(JSON.parse(res.body!), { ok: true });
    });

    it("stops at a redirect to http:// without following it", async () => {
        const log: string[] = [];
        const fetcher = fakeFetcher({ "https://a.example/x": redirect("http://a.example/x") }, log);
        const res = await fetchFollowing("https://a.example/x", { fetcher });
        assert.equal(res.insecureRedirect, "http://a.example/x");
        assert.match(res.error!, /isn't HTTPS/);
        assert.deepEqual(log, ["https://a.example/x"]);
    });

    it("gives up after 10 redirects", async () => {
        const routes: Record<string, ReturnType<typeof redirect>> = {};
        for (let i = 0; i < 12; i++) routes[`https://a.example/${i}`] = redirect(`/${i + 1}`);
        const res = await fetchFollowing("https://a.example/0", { fetcher: fakeFetcher(routes) });
        assert.equal(res.status, 0);
        assert.match(res.error!, /more than 10 redirects/);
    });

    it("refuses a body over 1 MB", async () => {
        const fetcher = fakeFetcher({ "https://a.example/big": { body: "x".repeat(1_000_001) } });
        const res = await fetchFollowing("https://a.example/big", { fetcher });
        assert.match(res.error!, /larger than/);
        assert.equal(res.body, undefined);
    });

    it("reports a network error with its code", async () => {
        const fetcher = fakeFetcher({ "https://a.example/": { error: networkError("ECONNRESET") } });
        const res = await fetchFollowing("https://a.example/", { fetcher });
        assert.equal(res.status, 0);
        assert.match(res.error!, /^ECONNRESET/);
    });

    it("times out", async () => {
        const fetcher = fakeFetcher({ "https://a.example/": { hang: true } });
        const res = await fetchFollowing("https://a.example/", { fetcher, timeoutMs: 15 });
        assert.equal(res.error, "timed out after 15 ms");
    });

    it("sends a pollen user agent, asks for JSON, and handles redirects itself", async () => {
        let seen: { redirect: string; headers: Record<string, string> } | undefined;
        const res = await fetchFollowing("https://a.example/", {
            fetcher: async (_url, init) => {
                seen = init;
                return new Response("{}");
            },
        });
        assert.equal(res.status, 200);
        assert.equal(seen?.redirect, "manual");
        assert.equal(seen?.headers["user-agent"], USER_AGENT);
        assert.equal(seen?.headers.accept, "application/json");
        assert.ok(USER_AGENT.startsWith(`pollen/${VERSION} `));
    });
});

describe("parseJson", () => {
    it("parses JSON", () => {
        assert.deepEqual(parseJson('{"a":1}'), { ok: true, value: { a: 1 } });
    });
    it("treats blank text as empty", () => {
        assert.deepEqual(parseJson("  \n"), { ok: false, error: "the document is empty" });
        assert.deepEqual(parseJson(undefined), { ok: false, error: "the document is empty" });
    });
    it("reports a syntax error", () => {
        const res = parseJson("{");
        assert.equal(res.ok, false);
        assert.ok(res.error);
    });
});
