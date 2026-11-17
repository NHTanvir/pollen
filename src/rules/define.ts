import { specUrl } from "../spec.js";
import type { Context, Group, Outcome, Rule, Severity, Stage } from "../types.js";
import type { Json } from "../util.js";

interface RuleSpec {
    id: string;
    title: string;
    group: Group;
    stage: Stage;
    severity: Severity;
    section: string;
}

export function defineRule(spec: RuleSpec, check: (ctx: Context) => Outcome): Rule {
    return { ...spec, specUrl: specUrl(spec.section), check };
}

/** The document, for rules in the document stage, which only run when there is one. */
export function docOf(ctx: Context): Json {
    if (!ctx.doc) throw new Error("document-stage rule ran without a document");
    return ctx.doc;
}

export const pass: Outcome = { status: "pass" };

export function skip(note: string): Outcome {
    return { status: "skip", note };
}

export function fail(path: string, message: string, fix: string): Outcome {
    return { status: "fail", problems: [{ path, message, fix }] };
}
