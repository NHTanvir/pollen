import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatJson, formatText } from "../src/report.js";
import { WELL_KNOWN, base, live, make, offline } from "./helpers.js";

const ESC = "\x1b[";
const broken = () => offline(make((d) => ((d.web = { disabled: true, browser_session_endpoint: "https://fernandfinch.example/bs" }), (d.apis = [{ type: "graphql", url: "https://api.fernandfinch.example/graphql", description: "Orders" }]))));

describe("formatText", () => {
    it("prints a FAIL line with the problem, its fix, and the spec link", () => {
        const text = formatText(broken());
        assert.match(text, /FAIL {2}web\.disabled/);
        assert.match(text, /✗ web\.browser_session_endpoint: must not be set when web\.disabled is true/);
        assert.match(text, /fix: Remove browser_session_endpoint/);
        assert.match(text, /https:\/\/personalagentprotocol\.org\/docs\/1\.0\/spec#web-browsing/);
    });

    it("prints warnings as WARN", () => {
        assert.match(formatText(broken()), /WARN {2}apis\.types/);
    });

    it("ends with the score, the counts, and a verdict", () => {
        const text = formatText(broken());
        assert.match(text, /Score 70\/100 {3}\d+ passed · 1 error · 1 warning · \d+ skipped/);
        assert.match(text, /FAIL {2}Fix the 1 error above/);
        assert.match(formatText(offline(base())), /PASS {2}Personal Agents can use this document\.\n$/);
    });

    it("says when there's no document at all", async () => {
        const text = formatText(await live(base(), { [WELL_KNOWN]: { status: 404 } }));
        assert.match(text, /There's no document Personal Agents can read here/);
    });

    it("collapses a group skipped for one reason into one line", () => {
        assert.match(formatText(offline(base())), /OAuth metadata\n {2}SKIP {2}9 rules: Local file: OAuth metadata is checked only against a live URL\./);
    });

    it("hides passing and skipped rules with failuresOnly", () => {
        const text = formatText(broken(), { failuresOnly: true });
        assert.doesNotMatch(text, /PASS {2}document\.json/);
        assert.doesNotMatch(text, /SKIP/);
        assert.match(text, /FAIL {2}web\.disabled/);
    });

    it("uses color only when asked", () => {
        assert.ok(!formatText(broken()).includes(ESC));
        assert.ok(formatText(broken(), { color: true }).includes(ESC));
    });
});

describe("formatJson", () => {
    it("round-trips the report", () => {
        const report = broken();
        assert.deepEqual(JSON.parse(formatJson(report)), report);
    });

    it("has the fields CI scripts rely on", () => {
        const json = JSON.parse(formatJson(broken()));
        for (const key of ["tool", "spec_version", "target", "mode", "score", "ok", "summary", "notes", "results"]) assert.ok(key in json, key);
        const failed = json.results.find((r: { id: string }) => r.id === "web.disabled");
        assert.deepEqual(Object.keys(failed).sort(), ["group", "id", "problems", "section", "severity", "spec_url", "status", "title"]);
        assert.deepEqual(Object.keys(failed.problems[0]).sort(), ["fix", "message", "path"]);
    });
});
