#!/usr/bin/env node
// The pollen command line. Exit codes: 0 passed, 1 failed, 2 usage or internal error.

import { parseArgs } from "node:util";
import { check, TargetError } from "./check.js";
import { formatJson, formatText } from "./report.js";
import { VERSION } from "./version.js";

const HELP = `pollen ${VERSION}: validate and generate /.well-known/poppy.json for the
Personal Agent Protocol (Poppy) 1.0.

Usage
  pollen check <url | domain | file>   Check a live site or a local poppy.json
  pollen init                          Answer a few questions, get a valid poppy.json
  pollen demo                          Run against bundled examples, offline

Check options
  --json             Machine-readable report, for CI
  --failures-only    Show only failed rules
  --skip-oauth       Don't fetch the OAuth metadata (live URLs only)
  --timeout <ms>     Per-request timeout (default 10000)
  --no-color         Plain output (also NO_COLOR=1)

Init options
  --out <path>       Where to write (default ./poppy.json)
  --force            Overwrite an existing file

Examples
  npx @nhtanvir/pollen check example.com
  npx @nhtanvir/pollen check https://example.com --json
  npx @nhtanvir/pollen check ./public/.well-known/poppy.json

Exit codes: 0 = passed, 1 = failed, 2 = usage error.
Spec: https://personalagentprotocol.org/docs/1.0/spec#discovery
`;

export async function main(argv: string[]): Promise<number> {
    let parsed;
    try {
        parsed = parseArgs({
            args: argv,
            allowPositionals: true,
            strict: true,
            options: {
                json: { type: "boolean" },
                "failures-only": { type: "boolean" },
                "skip-oauth": { type: "boolean" },
                timeout: { type: "string" },
                "no-color": { type: "boolean" },
                out: { type: "string" },
                force: { type: "boolean" },
                help: { type: "boolean", short: "h" },
                version: { type: "boolean", short: "v" },
            },
        });
    } catch (error) {
        return usage(error instanceof Error ? error.message : String(error));
    }
    const { values, positionals } = parsed;
    const [command, ...rest] = positionals;

    if (values.version) {
        process.stdout.write(`${VERSION}\n`);
        return 0;
    }
    if (values.help || command === undefined || command === "help") {
        process.stdout.write(HELP);
        return command === undefined && !values.help ? 2 : 0;
    }

    const color = !values["no-color"] && !values.json && wantsColor();

    switch (command) {
        case "check": {
            if (rest.length !== 1) return usage("check takes one target: a URL, a domain, or a file path.");
            const timeoutMs = values.timeout === undefined ? undefined : Number(values.timeout);
            if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs <= 0)) return usage("--timeout must be a positive number of milliseconds.");
            try {
                const report = await check(rest[0]!, { timeoutMs, skipOAuth: values["skip-oauth"] });
                process.stdout.write(values.json ? formatJson(report) : formatText(report, { color, failuresOnly: values["failures-only"] }));
                return report.ok ? 0 : 1;
            } catch (error) {
                if (error instanceof TargetError) return usage(error.message);
                throw error;
            }
        }
        default:
            return usage(`Unknown command "${command}".`);
    }
}

function wantsColor(): boolean {
    if (process.env.NO_COLOR) return false;
    if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true;
    return process.stdout.isTTY === true;
}

function usage(message: string): number {
    process.stderr.write(`pollen: ${message}\nRun "pollen --help" for usage.\n`);
    return 2;
}

main(process.argv.slice(2)).then(
    (code) => {
        process.exitCode = code;
    },
    (error: unknown) => {
        process.stderr.write(`pollen: internal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
        process.exitCode = 2;
    },
);
