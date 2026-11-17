// pollen demo: checks the bundled example documents, offline, so anyone can see Pollen work
// without a site of their own. Also a self-test: it fails if any example behaves unexpectedly.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDocument } from "./check.js";
import { formatText } from "./report.js";
import type { Report } from "./types.js";

/** tests/fixtures, from dist/src/ in the repo and in the installed package alike. */
export const FIXTURES_DIR = fileURLToPath(new URL("../../tests/fixtures/", import.meta.url));

export interface Manifest {
    /** File name to what it shows. */
    valid: Record<string, string>;
    /** File name to the one error rule it breaks. */
    invalid: Record<string, string>;
}

export const SHOWCASE = "web-disabled-with-endpoint.json";

export function loadManifest(dir: string = FIXTURES_DIR): Manifest {
    return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest;
}

export function checkFixture(kind: "valid" | "invalid", file: string, dir: string = FIXTURES_DIR): Report {
    return validateDocument(readFileSync(join(dir, kind, file), "utf8"), { label: `${kind}/${file}` });
}

/** The ids of error rules that failed. */
export function failedErrors(report: Report): string[] {
    return report.results.filter((r) => r.status === "fail" && r.severity === "error").map((r) => r.id);
}

export function runDemo(options: { color: boolean; write: (text: string) => void }): number {
    const paint = (code: number, text: string) => (options.color ? `\x1b[${code}m${text}\x1b[0m` : text);
    const out = (line = "") => options.write(`${line}\n`);
    const manifest = loadManifest();
    const width = Math.max(...[...Object.keys(manifest.valid), ...Object.keys(manifest.invalid)].map((f) => f.length));
    let unexpected = 0;

    out(`${paint(1, "pollen demo")}: offline, against the example documents bundled with pollen`);
    out();
    out(paint(1, "Valid documents"));
    for (const [file, about] of Object.entries(manifest.valid)) {
        const report = checkFixture("valid", file);
        const ok = report.ok;
        if (!ok) unexpected++;
        const status = ok ? paint(32, "PASS") : paint(31, "UNEXPECTED FAIL");
        const detail = ok ? paint(2, about) : failedErrors(report).join(", ");
        out(`  ${status}  ${String(report.score).padStart(3)}/100  ${file.padEnd(width)}  ${detail}`);
    }

    out();
    out(`${paint(1, "Broken documents")} ${paint(2, "(each breaks one rule)")}`);
    for (const [file, rule] of Object.entries(manifest.invalid)) {
        const report = checkFixture("invalid", file);
        const failed = failedErrors(report);
        const asExpected = failed.length === 1 && failed[0] === rule;
        if (!asExpected) unexpected++;
        const status = asExpected ? paint(31, "FAIL") : paint(33, "UNEXPECTED");
        const detail = asExpected ? paint(36, rule) : `expected only ${rule}, got ${failed.join(", ") || "no errors"}`;
        out(`  ${status}  ${String(report.score).padStart(3)}/100  ${file.padEnd(width)}  ${detail}`);
    }

    out();
    out(paint(2, `Full report for invalid/${SHOWCASE}:`));
    out();
    options.write(formatText(checkFixture("invalid", SHOWCASE), { color: options.color }));
    out();

    const total = Object.keys(manifest.valid).length + Object.keys(manifest.invalid).length;
    if (unexpected > 0) {
        out(paint(31, `${unexpected} of ${total} examples didn't behave as expected. Please report this: https://github.com/NHTanvir/pollen/issues`));
        return 1;
    }
    out(`All ${total} examples behaved as expected. Now check your own site:`);
    out(`  npx @nhtanvir/pollen check your-domain.com`);
    return 0;
}
