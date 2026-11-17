import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discoverOAuth, selectIssuer, serverMetadataUrl } from "../src/discover.js";
import { AS_URL, ISSUER, ORIGIN, PRM_URL, base, fakeFetcher, goodAs, goodPrm } from "./helpers.js";

describe("serverMetadataUrl (RFC 8414 §3.1)", () => {
    it("appends the well-known path to an issuer with no path", () => {
        assert.equal(serverMetadataUrl("https://auth.example.com"), "https://auth.example.com/.well-known/oauth-authorization-server");
        assert.equal(serverMetadataUrl("https://auth.example.com/"), "https://auth.example.com/.well-known/oauth-authorization-server");
    });
    it("puts the well-known segment before the issuer's path", () => {
        assert.equal(serverMetadataUrl("https://auth.provider.example/shop-a"), "https://auth.provider.example/.well-known/oauth-authorization-server/shop-a");
        assert.equal(serverMetadataUrl("https://auth.provider.example/shop-a/"), "https://auth.provider.example/.well-known/oauth-authorization-server/shop-a");
    });
});

describe("selectIssuer (spec 3.2)", () => {
    it("selects none when no server is listed", () => {
        assert.equal(selectIssuer(undefined, {}), undefined);
        assert.equal(selectIssuer([], { auth: { issuer: ISSUER } }), undefined);
    });
    it("selects the only server", () => {
        assert.equal(selectIssuer([ISSUER], {}), ISSUER);
        assert.equal(selectIssuer([ISSUER], { auth: { issuer: "https://other.example" } }), ISSUER);
    });
    it("lets auth.issuer choose among several", () => {
        assert.equal(selectIssuer(["https://staff.example", ISSUER], { auth: { issuer: ISSUER } }), ISSUER);
        assert.equal(selectIssuer(["https://staff.example", ISSUER], {}), undefined);
        assert.equal(selectIssuer(["https://staff.example", ISSUER], { auth: { issuer: "https://nope.example" } }), undefined);
    });
});

describe("discoverOAuth", () => {
    it("stops after a 404 from the protected resource metadata", async () => {
        const log: string[] = [];
        const found = await discoverOAuth("fernandfinch.example", base(), { fetcher: fakeFetcher({}, log) });
        assert.equal(found.resourceMetadata.status, 404);
        assert.equal(found.issuer, undefined);
        assert.deepEqual(log, [PRM_URL]);
    });

    it("fetches the issuer's metadata", async () => {
        const log: string[] = [];
        const found = await discoverOAuth("FernAndFinch.example", base(), { fetcher: fakeFetcher({ [PRM_URL]: { body: goodPrm() }, [AS_URL]: { body: goodAs() } }, log) });
        assert.deepEqual(log, [PRM_URL, AS_URL], "the domain is lowercased for the metadata URL");
        assert.equal(found.issuer, ISSUER);
        assert.equal(found.serverMetadata?.status, 200);
        assert.equal(found.serverMetadataJson?.ok, true);
    });

    it("doesn't fetch metadata for an issuer that isn't HTTPS", async () => {
        const log: string[] = [];
        await discoverOAuth("fernandfinch.example", base(), { fetcher: fakeFetcher({ [PRM_URL]: { body: { resource: ORIGIN, authorization_servers: ["http://auth.fernandfinch.example"] } } }, log) });
        assert.deepEqual(log, [PRM_URL]);
    });
});
