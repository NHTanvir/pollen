// The real binary, run as a child process: exit codes, output modes, and every command.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { FIXTURES_DIR, loadManifest } from "../src/demo.js";
import { RULES } from "../src/rules/index.js";
import { VERSION } from "../src/version.js";

const CLI = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const PACKAGE = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string; bin: Record<string, string> };
const VALID = join(FIXTURES_DIR, "valid", "spec-example.json");
const INVALID = join(FIXTURES_DIR, "invalid", "web-disabled-with-endpoint.json");
const ESC = "\x1b[";

const dir = mkdtempSync(join(tmpdir(), "pollen-cli-"));
after(() => rmSync(dir, { recursive: true, force: true }));

function run(args: string[], options: { input?: string; env?: Record<string, string>; cwd?: string } = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
    const env = { ...process.env };
    delete env.NO_COLOR;
    delete env.FORCE_COLOR;
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [CLI, ...args], { cwd: options.cwd ?? dir, env: { ...env, ...options.env } });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += String(chunk)));
        child.stderr.on("data", (chunk) => (stderr += String(chunk)));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
        child.stdin.end(options.input ?? "");
    });
}

describe("pollen", () => {
    it("--version prints the package version", async () => {
        const { code, stdout } = await run(["--version"]);
        assert.equal(code, 0);
        assert.equal(stdout, `${PACKAGE.version}\n`);
        assert.equal(VERSION, PACKAGE.version);
    });

    it("is an executable script named pollen", () => {
        assert.equal(PACKAGE.bin.pollen, "dist/src/cli.js");
        assert.ok(readFileSync(CLI, "utf8").startsWith("#!/usr/bin/env node\n"));
    });

    it("--help lists every command and exits 0", async () => {
        const { code, stdout } = await run(["--help"]);
        assert.equal(code, 0);
        for (const text of ["pollen check", "pollen init", "pollen demo", "--json", "--skip-oauth"]) assert.ok(stdout.includes(text), text);
    });

    it("exits 2 with usage when there's no command, an unknown command, or a bad flag", async () => {
        assert.equal((await run([])).code, 2);
        const unknown = await run(["lint"]);
        assert.equal(unknown.code, 2);
        assert.match(unknown.stderr, /Unknown command "lint"/);
        assert.equal((await run(["check", VALID, "--bogus"])).code, 2);
        assert.equal((await run(["check", VALID, "--timeout", "soon"])).code, 2);
        assert.equal((await run(["check"])).code, 2);
        assert.equal((await run(["check", VALID, INVALID])).code, 2);
        assert.equal((await run(["init", "extra"])).code, 2);
        assert.equal((await run(["demo", "extra"])).code, 2);
    });

    it("exits 2 for a target that isn't a file, URL, or domain", async () => {
        const { code, stderr } = await run(["check", "not a domain"]);
        assert.equal(code, 2);
        assert.match(stderr, /isn't a file, a URL, or a domain name/);
    });
});

describe("pollen check", () => {
    it("exits 0 for a valid document", async () => {
        const { code, stdout } = await run(["check", VALID]);
        assert.equal(code, 0);
        assert.match(stdout, /PASS {2}Poppy 1\.0 Personal Agents can use this document\./);
    });

    it("exits 1 for an invalid document and shows the fix", async () => {
        const { code, stdout } = await run(["check", INVALID]);
        assert.equal(code, 1);
        assert.match(stdout, /FAIL {2}web\.disabled/);
        assert.match(stdout, /fix: /);
    });

    it("--json prints one machine-readable report", async () => {
        const { code, stdout } = await run(["check", INVALID, "--json"]);
        assert.equal(code, 1);
        const report = JSON.parse(stdout);
        assert.equal(report.ok, false);
        assert.equal(report.score, 75);
        assert.equal(report.results.length, RULES.length);
        assert.deepEqual(
            report.results.filter((r: { status: string; severity: string }) => r.status === "fail" && r.severity === "error").map((r: { id: string }) => r.id),
            ["web.disabled"],
        );
    });

    it("--failures-only hides passing rules", async () => {
        const { stdout } = await run(["check", INVALID, "--failures-only"]);
        assert.doesNotMatch(stdout, /PASS {2}document\.json/);
        assert.match(stdout, /FAIL {2}web\.disabled/);
    });

    it("uses color for FORCE_COLOR, and never with --no-color or NO_COLOR", async () => {
        assert.ok((await run(["check", INVALID], { env: { FORCE_COLOR: "1" } })).stdout.includes(ESC));
        assert.ok(!(await run(["check", INVALID, "--no-color"], { env: { FORCE_COLOR: "1" } })).stdout.includes(ESC));
        assert.ok(!(await run(["check", INVALID], { env: { FORCE_COLOR: "1", NO_COLOR: "1" } })).stdout.includes(ESC));
        assert.ok(!(await run(["check", INVALID, "--json"], { env: { FORCE_COLOR: "1" } })).stdout.includes(ESC));
    });
});

describe("pollen demo", () => {
    it("runs offline over every fixture and exits 0", async () => {
        const manifest = loadManifest();
        const total = Object.keys(manifest.valid).length + Object.keys(manifest.invalid).length;
        const { code, stdout } = await run(["demo"]);
        assert.equal(code, 0);
        assert.match(stdout, new RegExp(`All ${total} examples behaved as expected`));
        assert.match(stdout, /Full report for invalid\//);
    });
});

describe("pollen init", () => {
    it("writes poppy.json from piped answers, then refuses to overwrite it", async () => {
        const cwd = mkdtempSync(join(dir, "init-"));
        const answers = "Orbit Air\norbit.example\n\ny\n\n\n\n\n";
        const first = await run(["init"], { cwd, input: answers });
        assert.equal(first.code, 0, first.stderr);
        assert.ok(existsSync(join(cwd, "poppy.json")));
        const check = await run(["check", join(cwd, "poppy.json")]);
        assert.equal(check.code, 0);
        const second = await run(["init"], { cwd, input: answers });
        assert.equal(second.code, 2);
        assert.match(second.stderr, /already exists/);
    });

    it("--out picks the path", async () => {
        const cwd = mkdtempSync(join(dir, "init-"));
        const { code } = await run(["init", "--out", "public/.well-known/poppy.json"], { cwd, input: "Orbit Air\norbit.example\n\ny\n\n\n\n\n" });
        assert.equal(code, 0);
        assert.ok(existsSync(join(cwd, "public", ".well-known", "poppy.json")));
    });
});
