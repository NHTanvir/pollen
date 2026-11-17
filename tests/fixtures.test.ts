// The bundled fixtures: valid ones pass cleanly, offline and served live, and each invalid one
// breaks exactly the error rule the manifest names.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { check } from "../src/check.js";
import { FIXTURES_DIR, SHOWCASE, checkFixture, failedErrors, loadManifest } from "../src/demo.js";
import { fakeFetcher } from "./helpers.js";

const manifest = loadManifest();

describe("valid fixtures", () => {
    for (const file of Object.keys(manifest.valid)) {
        it(`${file} passes every rule that applies`, () => {
            const report = checkFixture("valid", file);
            assert.deepEqual(
                report.results.filter((r) => r.status === "fail").map((r) => r.id),
                [],
            );
            assert.equal(report.score, 100);
            assert.equal(report.ok, true);
        });

        it(`${file} also passes when served live from its own domain`, async () => {
            const doc = JSON.parse(readFileSync(join(FIXTURES_DIR, "valid", file), "utf8"));
            const url = `https://${doc.organization.domain}/.well-known/poppy.json`;
            const report = await check(url, { fetcher: fakeFetcher({ [url]: { body: doc } }), skipOAuth: true });
            assert.deepEqual(failedErrors(report), []);
            assert.equal(report.results.find((r) => r.id === "organization.domain-host")?.status, "pass");
        });
    }
});

describe("invalid fixtures", () => {
    for (const [file, rule] of Object.entries(manifest.invalid)) {
        it(`${file} breaks only ${rule}`, () => {
            assert.deepEqual(failedErrors(checkFixture("invalid", file)), [rule]);
        });
    }
});

describe("manifest", () => {
    it("lists every fixture file, and only files that exist", () => {
        for (const kind of ["valid", "invalid"] as const) {
            const files = readdirSync(join(FIXTURES_DIR, kind)).filter((f) => f.endsWith(".json")).sort();
            assert.deepEqual(Object.keys(manifest[kind]).sort(), files, `${kind}/ and manifest.json disagree`);
        }
    });

    it("has at least 3 valid and 5 invalid fixtures", () => {
        assert.ok(Object.keys(manifest.valid).length >= 3);
        assert.ok(Object.keys(manifest.invalid).length >= 5);
    });

    it("names a different rule for each invalid fixture", () => {
        const rules = Object.values(manifest.invalid);
        assert.equal(new Set(rules).size, rules.length);
    });

    it("includes the demo's showcase fixture", () => {
        assert.ok(SHOWCASE in manifest.invalid);
    });
});
