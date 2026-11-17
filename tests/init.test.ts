import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { after, describe, it } from "node:test";
import { validateDocument } from "../src/check.js";
import { askQuestions, generatePoppy, InitAborted, lineReader, normalizeDomain, runInit, type Ask, type InitAnswers } from "../src/init.js";

const dir = mkdtempSync(join(tmpdir(), "pollen-init-"));
after(() => rmSync(dir, { recursive: true, force: true }));

function sink() {
    let text = "";
    const stream = new Writable({
        write(chunk, _encoding, done) {
            text += String(chunk);
            done();
        },
    });
    return { stream, text: () => text };
}

function input(lines: string[]): PassThrough {
    const stream = new PassThrough();
    stream.end(lines.map((line) => `${line}\n`).join(""));
    return stream;
}

/** An Ask that replays answers, using the default for "", and records what it heard. */
function scripted(answers: string[]) {
    const remaining = [...answers];
    const said: string[] = [];
    const ask: Ask = async (_question, defaultValue) => {
        const answer = remaining.shift();
        if (answer === undefined) throw new InitAborted();
        return answer === "" ? (defaultValue ?? "") : answer;
    };
    return { ask, say: (line: string) => said.push(line), said };
}

const failures = (answers: InitAnswers) =>
    validateDocument(generatePoppy(answers), { servedHost: answers.domain })
        .results.filter((r) => r.status === "fail")
        .map((r) => r.id);

describe("generatePoppy", () => {
    it("makes the smallest valid document from a name and a domain", () => {
        const doc = generatePoppy({ name: "Fern & Finch", domain: "FernAndFinch.example", website: true });
        assert.deepEqual(doc, { protocol_version: "1.0", organization: { name: "Fern & Finch", domain: "fernandfinch.example" }, web: {} });
    });

    it("includes every interface, in the spec example's field order", () => {
        const doc = generatePoppy({
            name: "Orbit Air",
            domain: "orbit.example",
            issuer: "https://auth.orbit.example",
            website: true,
            browserSessionEndpoint: "https://orbit.example/poppy/browser-session",
            agentEndpoint: "https://api.orbit.example/poppy/conversations",
            openapiUrl: "https://api.orbit.example/openapi.json",
            mcpUrl: "https://mcp.orbit.example/mcp",
        });
        assert.deepEqual(Object.keys(doc), ["protocol_version", "organization", "auth", "agent", "apis", "web"]);
        assert.deepEqual(doc.web, { browser_session_endpoint: "https://orbit.example/poppy/browser-session" });
        assert.equal((doc.apis as unknown[]).length, 2);
    });

    it("asks agents not to browse when the website is off and another channel exists", () => {
        const doc = generatePoppy({ name: "Lumen", domain: "lumen.example", website: false, openapiUrl: "https://api.lumen.example/openapi.json" });
        assert.deepEqual(doc.web, { disabled: true });
    });

    it("falls back to the website when there's no other channel", () => {
        assert.deepEqual(generatePoppy({ name: "Lumen", domain: "lumen.example", website: false }).web, {});
    });

    it("always produces a document with no failures, for every combination of answers", () => {
        for (let mask = 0; mask < 64; mask++) {
            const on = (bit: number) => (mask & (1 << bit)) !== 0;
            const answers: InitAnswers = {
                name: "Orbit Air",
                domain: "orbit.example",
                issuer: on(0) ? "https://auth.orbit.example" : undefined,
                website: on(1),
                browserSessionEndpoint: on(1) && on(2) ? "https://orbit.example/poppy/browser-session" : undefined,
                agentEndpoint: on(3) ? "https://api.orbit.example/poppy/conversations" : undefined,
                openapiUrl: on(4) ? "https://api.orbit.example/openapi.json" : undefined,
                mcpUrl: on(5) ? "https://mcp.orbit.example/mcp" : undefined,
            };
            assert.deepEqual(failures(answers), [], `answers ${JSON.stringify(answers)}`);
        }
    });
});

describe("normalizeDomain", () => {
    it("accepts hosts, URLs, and mixed case", () => {
        assert.equal(normalizeDomain("Example.com"), "example.com");
        assert.equal(normalizeDomain(" https://example.com/ "), "example.com");
        assert.equal(normalizeDomain("https://shop.example.com/path"), "shop.example.com");
        assert.equal(normalizeDomain("example.com:443"), "example.com");
        assert.equal(normalizeDomain("example.com:8443"), "example.com:8443");
    });
    it("rejects what isn't a domain", () => {
        assert.equal(normalizeDomain("localhost"), undefined);
        assert.equal(normalizeDomain("not a domain"), undefined);
        assert.equal(normalizeDomain("example.com/path"), undefined);
    });
});

describe("askQuestions", () => {
    it("collects every answer, with defaults for blank descriptions", async () => {
        const s = scripted(["Orbit Air", "orbit.example", "https://auth.orbit.example", "y", "https://orbit.example/bs", "https://api.orbit.example/c", "Trips", "https://api.orbit.example/openapi.json", "", "https://mcp.orbit.example/mcp", ""]);
        const answers = await askQuestions(s.ask, s.say);
        assert.deepEqual(answers, {
            name: "Orbit Air",
            domain: "orbit.example",
            issuer: "https://auth.orbit.example",
            website: true,
            browserSessionEndpoint: "https://orbit.example/bs",
            agentEndpoint: "https://api.orbit.example/c",
            agentDescription: "Trips",
            openapiUrl: "https://api.orbit.example/openapi.json",
            openapiDescription: "Orbit Air API",
            mcpUrl: "https://mcp.orbit.example/mcp",
            mcpDescription: "Orbit Air tools",
        });
    });

    it("asks again after an invalid answer", async () => {
        const s = scripted(["X", "not a domain", "x.example", "http://auth.x.example", "", "maybe", "n", "", "", ""]);
        const answers = await askQuestions(s.ask, s.say);
        assert.equal(answers.domain, "x.example");
        assert.equal(answers.issuer, undefined);
        assert.equal(answers.website, false);
        const said = s.said.join("\n");
        assert.match(said, /Enter a host name/);
        assert.match(said, /Enter a full https:\/\/ URL/);
        assert.match(said, /Answer y or n/);
        assert.match(said, /needs at least one channel/);
    });

    it("treats a blank browse answer as yes", async () => {
        const s = scripted(["X", "x.example", "", "", "", "", "", ""]);
        assert.equal((await askQuestions(s.ask, s.say)).website, true);
    });
});

describe("lineReader", () => {
    it("keeps answers that arrive before their questions, and stops at the end of input", async () => {
        const out = sink();
        const reader = lineReader(input(["first", " second "]), out.stream);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(await reader.ask("Q1"), "first");
        assert.equal(await reader.ask("Q2"), "second");
        await assert.rejects(reader.ask("Q3"), InitAborted);
        assert.equal(out.text(), "Q1: Q2: Q3: ");
        reader.close();
    });

    it("shows and uses the default for a blank line", async () => {
        const out = sink();
        const reader = lineReader(input([""]), out.stream);
        assert.equal(await reader.ask("Name", "Bob"), "Bob");
        assert.equal(out.text(), "Name [Bob]: ");
        reader.close();
    });
});

describe("runInit", () => {
    const answers = ["Orbit Air", "orbit.example", "", "y", "", "", "", ""];

    it("writes a valid document, creating folders, and prints next steps", async () => {
        const out = join(dir, "site", "public", ".well-known", "poppy.json");
        const output = sink();
        const code = await runInit({ out, force: false, input: input(answers), output: output.stream });
        assert.equal(code, 0);
        assert.equal(validateDocument(readFileSync(out, "utf8"), { servedHost: "orbit.example" }).score, 100);
        assert.match(output.text(), /score 100\/100/);
        assert.match(output.text(), /Serve it at https:\/\/orbit\.example\/\.well-known\/poppy\.json/);
    });

    it("won't overwrite a file without --force", async () => {
        const out = join(dir, "existing.json");
        writeFileSync(out, "keep me");
        const errors = sink();
        const code = await runInit({ out, force: false, input: input(answers), output: sink().stream, errors: errors.stream });
        assert.equal(code, 2);
        assert.match(errors.text(), /already exists/);
        assert.equal(readFileSync(out, "utf8"), "keep me");
    });

    it("overwrites with --force", async () => {
        const out = join(dir, "forced.json");
        writeFileSync(out, "old");
        assert.equal(await runInit({ out, force: true, input: input(answers), output: sink().stream }), 0);
        assert.equal(JSON.parse(readFileSync(out, "utf8")).protocol_version, "1.0");
    });

    it("writes nothing when input ends early", async () => {
        const out = join(dir, "never.json");
        const errors = sink();
        const code = await runInit({ out, force: false, input: input(["Orbit Air"]), output: sink().stream, errors: errors.stream });
        assert.equal(code, 2);
        assert.match(errors.text(), /nothing was written/);
        assert.equal(existsSync(out), false);
    });
});
