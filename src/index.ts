// Library entry point: import { check, validateDocument } from "@nhtanvir/pollen".

export { check, resolveTarget, score, validateDocument, TargetError, WEIGHTS, type CheckOptions, type Target } from "./check.js";
export { formatJson, formatText, type TextOptions } from "./report.js";
export { RULES, ruleById } from "./rules/index.js";
export { SPEC_VERSION } from "./spec.js";
export { VERSION } from "./version.js";
export type { Fetcher } from "./fetch.js";
export type * from "./types.js";
