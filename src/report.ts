// Renders a Report as a readable terminal report or as JSON.

import { GROUPS, type Report, type RuleResult } from "./types.js";

export interface TextOptions {
    color?: boolean;
    /** Hide passing and skipped rules. */
    failuresOnly?: boolean;
}

const CODES = { reset: 0, bold: 1, dim: 2, red: 31, green: 32, yellow: 33, cyan: 36 } as const;
type Style = keyof typeof CODES;

export function formatJson(report: Report): string {
    return `${JSON.stringify(report, null, 2)}\n`;
}

function label(result: RuleResult): { text: string; style: Style } {
    if (result.status === "pass") return { text: "PASS", style: "green" };
    if (result.status === "skip") return { text: "SKIP", style: "dim" };
    return result.severity === "error" ? { text: "FAIL", style: "red" } : { text: "WARN", style: "yellow" };
}

export function formatText(report: Report, options: TextOptions = {}): string {
    const paint = (style: Style, text: string) => (options.color ? `\x1b[${CODES[style]}m${text}\x1b[0m` : text);
    const lines: string[] = [];
    const width = Math.max(...report.results.filter((r) => r.status !== "skip").map((r) => r.id.length), 0);

    lines.push(`${paint("bold", "pollen")} ${report.tool.version} · Poppy ${report.spec_version} discovery check`);
    lines.push(`${paint("dim", "target")}  ${report.target}`);
    if (report.final_url && report.final_url !== report.target) lines.push(`${paint("dim", "served")}  ${report.final_url}`);
    for (const note of report.notes) lines.push(`${paint("dim", "note")}    ${note}`);

    for (const group of GROUPS) {
        const all = report.results.filter((r) => r.group === group);
        const shown = all.filter((r) => (options.failuresOnly ? r.status === "fail" : r.status !== "skip"));
        const skipped = options.failuresOnly ? [] : all.filter((r) => r.status === "skip");
        if (shown.length === 0 && skipped.length === 0) continue;
        lines.push("", paint("bold", group));
        for (const result of shown) {
            const { text, style } = label(result);
            lines.push(`  ${paint(style, text)}  ${result.id.padEnd(width)}  ${result.title}  ${paint("dim", sectionLabel(result.section))}`);
            for (const problem of result.problems) {
                lines.push(`        ${paint(style, "✗")} ${paint("cyan", problem.path)}: ${problem.message}`);
                lines.push(`          ${paint("bold", "fix:")} ${problem.fix}`);
            }
            if (result.status === "fail") lines.push(`          ${paint("dim", result.spec_url)}`);
        }
        if (skipped.length > 0) {
            // A whole group skipped for one reason (a local file has no transport or OAuth) is one line.
            const notes = new Set(skipped.map((r) => r.note));
            const text =
                shown.length === 0 && notes.size === 1
                    ? `${plural(skipped.length, "rule")}: ${skipped[0]!.note}`
                    : `${skipped.map((r) => r.id).join(", ")} (not applicable)`;
            lines.push(`  ${paint("dim", "SKIP")}  ${paint("dim", text)}`);
        }
    }

    const { passed, errors, warnings, skipped } = report.summary;
    const scoreStyle: Style = report.score >= 90 ? "green" : report.score >= 60 ? "yellow" : "red";
    lines.push("");
    lines.push(
        `${paint("bold", "Score")} ${paint(scoreStyle, `${report.score}/100`)}   ` +
            `${passed} passed · ${plural(errors, "error")} · ${plural(warnings, "warning")} · ${skipped} skipped`,
    );
    if (report.ok) {
        const extra = warnings > 0 ? ` Fix the ${plural(warnings, "warning")} to reach 100.` : "";
        lines.push(`${paint("green", "PASS")}  Personal Agents can use this document.${extra}`);
    } else if (!report.results.some((r) => r.group !== "Transport" && r.status !== "skip")) {
        lines.push(`${paint("red", "FAIL")}  There's no document Personal Agents can read here.`);
    } else {
        lines.push(`${paint("red", "FAIL")}  Fix the ${plural(errors, "error")} above. Personal Agents won't use this document until then.`);
    }
    return `${lines.join("\n")}\n`;
}

function sectionLabel(section: string): string {
    return /^[0-9]/.test(section) ? `§${section}` : section;
}

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}
