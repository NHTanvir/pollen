import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { check, PENALTIES, resolveTarget, score, TargetError, validateDocument } from "../src/check.js";
import { RULES } from "../src/rules/index.js";
import type { RuleResult } from "../src/types.js";
import { WELL_KNOWN, base, live, make } from "./helpers.js";

const dir = mkdtempSync(join(tmpdir(), "pollen-check-"));
after(() => rmSync(dir, { recursive: true, force: true }));

describe("resolveTarget", () => {
    it("turns a bare domain into its well-known URL", () => {
        assert.deepEqual(resolveTarget("example.com"), { mode: "url", url: "https://example.com/.well-known/poppy.json", notes: [] });
    });
    it("adds the well-known path to a URL with no path", () => {
        assert.equal((resolveTarget("https://example.com") as { url: string }).url, "https://example.com/.well-known/poppy.json");
        assert.equal((resolveTarget("https://example.com/") as { url: string }).url, "https://example.com/.well-known/poppy.json");
    });
    it("keeps an explicit path, so transport.final-url can judge it", () => {
        assert.equal((resolveTarget("https://example.com/poppy.json") as { url: string }).url, "https://example.com/poppy.json");
    });
    it("keeps a port", () => {
        assert.equal((resolveTarget("shop.example.com:8443") as { url: string }).url, "https://shop.example.com:8443/.well-known/poppy.json");
    });
    it("checks http:// over https:// and says so", () => {
        const target = resolveTarget("http://example.com");
        assert.equal(target.mode, "url");
        assert.equal((target as { url: string }).url, "https://example.com/.well-known/poppy.json");
        assert.match(target.notes[0]!, /only fetch poppy\.json over HTTPS/);
    });
    it("reads an existing file", () => {
        const file = join(dir, "poppy.json");
        writeFileSync(file, "{}");
        const target = resolveTarget(file);
        assert.equal(target.mode, "file");
        assert.match(target.notes[0]!, /check the live domain too/);
    });
    it("rejects anything else", () => {
        assert.throws(() => resolveTarget("not a domain"), TargetError);
        assert.throws(() => resolveTarget("ftp://example.com"), TargetError);
        assert.throws(() => resolveTarget("./missing-file.json"), TargetError);
    });
});

describe("score", () => {
    const r = (status: RuleResult["status"], severity: RuleResult["severity"] = "error"): RuleResult => ({
        id: "x",
        title: "x",
        group: "Document",
        severity,
        section: "3",
        spec_url: "https://personalagentprotocol.org/docs/1.0/spec",
        status,
        problems: [],
    });
    it("is 100 when nothing failed, whatever was skipped", () => {
        assert.equal(score([r("pass"), r("skip"), r("skip", "warning")]), 100);
    });
    it("costs 25 per error and 5 per warning", () => {
        assert.equal(PENALTIES.error, 25);
        assert.equal(PENALTIES.warning, 5);
        assert.equal(score([r("fail"), r("pass")]), 75);
        assert.equal(score([r("fail"), r("fail", "warning")]), 70);
    });
    it("never goes below 0", () => {
        assert.equal(score(Array.from({ length: 9 }, () => r("fail"))), 0);
    });
});

describe("reports", () => {
    it("score 0 and not ok when there's no document", async () => {
        const report = await live(base(), { [WELL_KNOWN]: { status: 404 } });
        assert.equal(report.score, 0);
        assert.equal(report.ok, false);
    });

    it("count every rule exactly once", async () => {
        const report = await live(base());
        assert.equal(report.results.length, RULES.length);
        const { passed, errors, warnings, skipped } = report.summary;
        assert.equal(passed + errors + warnings + skipped, RULES.length);
        assert.deepEqual(
            report.results.map((x) => x.id),
            RULES.map((x) => x.id),
        );
    });

    it("are deterministic", async () => {
        const doc = make((d) => (d.agent = { protocols: [{ type: "a2a", endpoint: "http://x.example", description: "" }] }));
        assert.deepEqual(await live(doc), await live(doc));
        assert.deepEqual(validateDocument(doc), validateDocument(doc));
    });

    it("are the same for a parsed value and its JSON text", () => {
        const doc = base();
        assert.deepEqual(validateDocument(doc), validateDocument(JSON.stringify(doc)));
    });

    it("check a local file without the network", async () => {
        const file = join(dir, "local.json");
        writeFileSync(file, JSON.stringify(base()));
        const report = await check(file, {
            fetcher: () => {
                throw new Error("no network for files");
            },
        });
        assert.equal(report.mode, "file");
        assert.equal(report.ok, true);
        assert.equal(report.final_url, undefined);
    });

    it("record the final URL of a live check", async () => {
        const report = await live(base());
        assert.equal(report.mode, "url");
        assert.equal(report.final_url, WELL_KNOWN);
        assert.equal(report.target, WELL_KNOWN);
    });

    it("check organization.domain against servedHost when one is given", () => {
        const report = validateDocument(base(), { servedHost: "other.example" });
        assert.equal(report.results.find((x) => x.id === "organization.domain-host")?.status, "fail");
    });
});
